/**
 * Summary: Thin GitHub REST client used by the admin blog manager to read and
 *   commit files in THIS website repo. Vercel's filesystem is read-only and
 *   blog content is baked into the build, so the admin dashboard persists
 *   changes as git commits (which trigger a Vercel deploy, ~2-3 min to live).
 *   Multi-file changes (manifest + MDX + image) go through the Git Data API so
 *   each save is one atomic commit. Raw fetch, no octokit, matching the style
 *   of api/admin/catalogue-harvest/trigger.
 *
 * Required env (server-only; distinct from GITHUB_DISPATCH_* which targets the
 * desktop repo):
 *   GITHUB_CONTENT_TOKEN: fine-grained PAT with Contents: read & write on this
 *     website repo.
 *   GITHUB_CONTENT_REPO: "owner/repo" of this website repo.
 *   GITHUB_CONTENT_BRANCH: branch to read/commit (default "main").
 *
 * Dependencies: global fetch, Buffer.
 */

export type FileChange =
  | { path: string; contentText: string }
  | { path: string; contentBase64: string }
  | { path: string; delete: true };

// Thrown when a commit loses a race (expectedHeadSha mismatch, or the ref
// moved mid-sequence twice). Routes map this to a 409.
export class ConflictError extends Error {
  constructor(message = "Repository changed since the content was loaded") {
    super(message);
    this.name = "ConflictError";
  }
}

const API_ROOT = "https://api.github.com";

function env() {
  const token = process.env.GITHUB_CONTENT_TOKEN;
  const repo = process.env.GITHUB_CONTENT_REPO;
  const branch = process.env.GITHUB_CONTENT_BRANCH || "main";
  return { token, repo, branch };
}

export function githubContentConfigured(): boolean {
  const { token, repo } = env();
  return Boolean(token && repo);
}

async function gh(pathname: string, init?: RequestInit): Promise<Response> {
  const { token, repo } = env();
  if (!token || !repo) {
    throw new Error("GITHUB_CONTENT_TOKEN / GITHUB_CONTENT_REPO not configured");
  }
  return fetch(`${API_ROOT}/repos/${repo}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers || {}),
    },
  });
}

async function ghJson<T>(pathname: string, init?: RequestInit): Promise<T> {
  const resp = await gh(pathname, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`GitHub API ${resp.status} on ${pathname}: ${text.slice(0, 300)}`);
  }
  return (await resp.json()) as T;
}

// Small read cache so the admin list/editor stay snappy without hammering the
// API. Invalidated wholesale by any successful commit.
type CacheEntry = { at: number; value: unknown };
const readCache = new Map<string, CacheEntry>();
const READ_CACHE_MS = 15_000;

function cacheGet<T>(key: string): T | undefined {
  const hit = readCache.get(key);
  if (hit && Date.now() - hit.at < READ_CACHE_MS) return hit.value as T;
  return undefined;
}

function cacheSet(key: string, value: unknown) {
  readCache.set(key, { at: Date.now(), value });
}

export function clearGithubContentCache() {
  readCache.clear();
}

export async function getHead(): Promise<{ commitSha: string; treeSha: string }> {
  const { branch } = env();
  const ref = await ghJson<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
  const commitSha = ref.object.sha;
  const commit = await ghJson<{ tree: { sha: string } }>(`/git/commits/${commitSha}`);
  return { commitSha, treeSha: commit.tree.sha };
}

// Read a text file via the Contents API (fine for our <1MB manifest and MDX
// files). Returns null on 404 so callers can treat missing files as absent.
export async function getTextFile(path: string): Promise<{ text: string; sha: string } | null> {
  const cacheKey = `file:${path}`;
  const cached = cacheGet<{ text: string; sha: string } | null>(cacheKey);
  if (cached !== undefined) return cached;
  const { branch } = env();
  const resp = await gh(`/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`);
  if (resp.status === 404) {
    cacheSet(cacheKey, null);
    return null;
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`GitHub API ${resp.status} reading ${path}: ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { content?: string; encoding?: string; sha: string };
  if (typeof json.content !== "string") {
    throw new Error(`GitHub contents response for ${path} has no content (a directory?)`);
  }
  const value = {
    text: Buffer.from(json.content, "base64").toString("utf8"),
    sha: json.sha,
  };
  cacheSet(cacheKey, value);
  return value;
}

export async function listDir(
  path: string,
): Promise<Array<{ name: string; sha: string; type: string }>> {
  const cacheKey = `dir:${path}`;
  const cached = cacheGet<Array<{ name: string; sha: string; type: string }>>(cacheKey);
  if (cached !== undefined) return cached;
  const { branch } = env();
  const json = await ghJson<Array<{ name: string; sha: string; type: string }>>(
    `/contents/${encodeURI(path)}?ref=${encodeURIComponent(branch)}`,
  );
  if (!Array.isArray(json)) {
    throw new Error(`GitHub contents response for ${path} is not a directory listing`);
  }
  const value = json.map(({ name, sha, type }) => ({ name, sha, type }));
  cacheSet(cacheKey, value);
  return value;
}

type TreeEntry = {
  path: string;
  mode: "100644";
  type: "blob";
  sha: string | null;
};

// One atomic commit touching any number of files, via the Git Data API:
// blobs -> tree (base_tree) -> commit -> ref update. Deletions are tree
// entries with sha: null. The Contents API is avoided for writes because it
// is one-commit-per-file and caps JSON payloads at ~1MB (too small for PNGs).
export async function commitFiles(opts: {
  message: string;
  changes: FileChange[];
  expectedHeadSha?: string;
}): Promise<{ commitSha: string }> {
  const { branch } = env();
  if (!opts.changes.length) throw new Error("commitFiles called with no changes");

  const attempt = async (): Promise<{ commitSha: string } | "retry"> => {
    const ref = await ghJson<{ object: { sha: string } }>(`/git/ref/heads/${branch}`);
    const baseCommitSha = ref.object.sha;
    if (opts.expectedHeadSha && opts.expectedHeadSha !== baseCommitSha) {
      throw new ConflictError();
    }
    const baseCommit = await ghJson<{ tree: { sha: string } }>(`/git/commits/${baseCommitSha}`);

    const tree: TreeEntry[] = [];
    for (const change of opts.changes) {
      if ("delete" in change) {
        tree.push({ path: change.path, mode: "100644", type: "blob", sha: null });
        continue;
      }
      const blobBody =
        "contentText" in change
          ? { content: change.contentText, encoding: "utf-8" }
          : { content: change.contentBase64, encoding: "base64" };
      const blob = await ghJson<{ sha: string }>(`/git/blobs`, {
        method: "POST",
        body: JSON.stringify(blobBody),
      });
      tree.push({ path: change.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    const newTree = await ghJson<{ sha: string }>(`/git/trees`, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree }),
    });

    const newCommit = await ghJson<{ sha: string }>(`/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message: opts.message,
        tree: newTree.sha,
        parents: [baseCommitSha],
      }),
    });

    const refUpdate = await gh(`/git/refs/heads/${branch}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha, force: false }),
    });
    if (refUpdate.status === 422) {
      // Non-fast-forward: someone pushed between our ref read and update.
      return "retry";
    }
    if (!refUpdate.ok) {
      const text = await refUpdate.text().catch(() => "");
      throw new Error(`GitHub ref update ${refUpdate.status}: ${text.slice(0, 300)}`);
    }
    return { commitSha: newCommit.sha };
  };

  let result = await attempt();
  if (result === "retry") {
    // expectedHeadSha (if provided) is checked again inside the retry, so a
    // real content race still surfaces as ConflictError rather than a silent
    // overwrite.
    result = await attempt();
  }
  if (result === "retry") throw new ConflictError("Branch kept moving during commit");
  clearGithubContentCache();
  return result;
}
