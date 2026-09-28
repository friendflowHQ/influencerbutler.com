/**
 * GET    /api/admin/blog/posts/[id]?locale=  - full post for the editor
 *   (manifest entry + MDX body, en-US fallback like the public loader).
 * PUT    /api/admin/blog/posts/[id]          - update: one atomic commit
 *   regenerating the manifest entry and <id>.<locale>.mdx from the same
 *   payload, so manifest and frontmatter can never drift. Reschedule, park,
 *   and unpark are all just date changes through this route.
 * DELETE /api/admin/blog/posts/[id]          - one commit removing the
 *   manifest entry, every locale MDX file, and the hero PNG if present.
 *
 * Permission: blog.manage. Conflicts: PUT accepts expectedHeadSha (the branch
 * head the editor loaded against) and returns 409 when the repo moved.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { buildMdxFile, parseFrontmatter } from "@/lib/blog-markdown";
import { DEFAULT_BLOG_LOCALE, isBlogLocale, type BlogLocale } from "@/lib/blog";
import {
  ConflictError,
  commitFiles,
  getHead,
  getTextFile,
  githubContentConfigured,
  type FileChange,
} from "@/lib/github-content";
import {
  CONTENT_DIR,
  MANIFEST_PATH,
  SLUG_RE,
  computeStatus,
  loadManifestFromGitHub,
  localesByPost,
  sanitizeBody,
  serializeManifest,
  validateBody,
  validateEntry,
} from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function envError() {
  return NextResponse.json(
    { error: "GITHUB_CONTENT_TOKEN / GITHUB_CONTENT_REPO not configured" },
    { status: 500 },
  );
}

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!githubContentConfigured()) return envError();

  const { id } = await context.params;
  if (!SLUG_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  const requestedLocale = new URL(request.url).searchParams.get("locale");
  const locale: BlogLocale = isBlogLocale(requestedLocale) ? requestedLocale : DEFAULT_BLOG_LOCALE;

  try {
    const [manifest, locales, head] = await Promise.all([
      loadManifestFromGitHub(),
      localesByPost(),
      getHead(),
    ]);
    const entry = manifest.posts.find((p) => p.id === id);
    if (!entry) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    let servedLocale = locale;
    let file = await getTextFile(`${CONTENT_DIR}/${id}.${locale}.mdx`);
    if (!file && locale !== DEFAULT_BLOG_LOCALE) {
      servedLocale = DEFAULT_BLOG_LOCALE;
      file = await getTextFile(`${CONTENT_DIR}/${id}.${DEFAULT_BLOG_LOCALE}.mdx`);
    }
    if (!file) return NextResponse.json({ error: "Post file missing" }, { status: 404 });

    const { frontmatter, body } = parseFrontmatter(file.text);
    return NextResponse.json({
      entry,
      status: computeStatus(entry.date || ""),
      locale: servedLocale,
      body: sanitizeBody(body).trim(),
      frontmatter,
      locales: locales.get(id) || [],
      headSha: head.commitSha,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to load post: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!githubContentConfigured()) return envError();

  const { id } = await context.params;
  if (!SLUG_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let payload: { entry?: unknown; body?: unknown; locale?: unknown; expectedHeadSha?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const locale: BlogLocale = isBlogLocale(typeof payload.locale === "string" ? payload.locale : null)
    ? (payload.locale as BlogLocale)
    : DEFAULT_BLOG_LOCALE;
  const expectedHeadSha =
    typeof payload.expectedHeadSha === "string" ? payload.expectedHeadSha : undefined;

  const validated = validateEntry(payload.entry);
  if ("error" in validated) return NextResponse.json({ error: validated.error }, { status: 400 });
  if (validated.entry.id !== id) {
    return NextResponse.json({ error: "id cannot be changed" }, { status: 400 });
  }
  const bodyResult = validateBody(payload.body);
  if ("error" in bodyResult) return NextResponse.json({ error: bodyResult.error }, { status: 400 });

  try {
    const manifest = await loadManifestFromGitHub();
    const index = manifest.posts.findIndex((p) => p.id === id);
    if (index === -1) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    const existing = manifest.posts[index];

    // Manifest fields only change from the en-US save; a translation save
    // touches just its own MDX file (translated frontmatter, same date/image).
    const entry =
      locale === DEFAULT_BLOG_LOCALE
        ? {
            ...existing,
            ...validated.entry,
            // pinImage is currently a plain text field; dropping it entirely
            // when cleared is intentional.
            ...(validated.entry.pinImage ? {} : { pinImage: undefined }),
            ...(validated.entry.pinDescription ? {} : { pinDescription: undefined }),
            ...(validated.entry.imagePrompt ? {} : { imagePrompt: undefined }),
          }
        : existing;

    const changes: FileChange[] = [];
    if (locale === DEFAULT_BLOG_LOCALE) {
      manifest.posts[index] = entry;
      changes.push({ path: MANIFEST_PATH, contentText: serializeManifest(manifest) });
    }

    const mdx = buildMdxFile(
      {
        title: validated.entry.title,
        summary: validated.entry.summary,
        category: validated.entry.category,
        date: entry.date,
        author: entry.author,
        readingTime: validated.entry.readingTime,
        keywords: validated.entry.keywords,
        image: entry.image,
        imageAlt: validated.entry.imageAlt,
      },
      bodyResult.body,
    );
    changes.push({ path: `${CONTENT_DIR}/${id}.${locale}.mdx`, contentText: mdx });

    const { commitSha } = await commitFiles({
      message: `blog(admin): update ${id}${locale === DEFAULT_BLOG_LOCALE ? "" : ` (${locale})`}\n\nBy ${actor.email} via admin dashboard`,
      changes,
      expectedHeadSha,
    });

    await logAdminAction({
      actor,
      action: "blog.update",
      targetType: "blog_post",
      targetId: id,
      details: { locale, date: entry.date, commitSha },
    });

    return NextResponse.json({ entry, commitSha });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: "Post changed since you opened it. Reload and re-apply your edits." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Update failed: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!githubContentConfigured()) return envError();

  const { id } = await context.params;
  if (!SLUG_RE.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const [manifest, locales] = await Promise.all([loadManifestFromGitHub(), localesByPost()]);
    const index = manifest.posts.findIndex((p) => p.id === id);
    if (index === -1) return NextResponse.json({ error: "Post not found" }, { status: 404 });

    manifest.posts.splice(index, 1);
    const changes: FileChange[] = [
      { path: MANIFEST_PATH, contentText: serializeManifest(manifest) },
      ...(locales.get(id) || []).map(
        (locale): FileChange => ({ path: `${CONTENT_DIR}/${id}.${locale}.mdx`, delete: true }),
      ),
    ];
    // Remove the hero PNG too, if it exists in the tree.
    const hero = await getTextFileExists(`public/assets/blog/${id}.png`);
    if (hero) changes.push({ path: `public/assets/blog/${id}.png`, delete: true });

    const { commitSha } = await commitFiles({
      message: `blog(admin): delete ${id}\n\nBy ${actor.email} via admin dashboard`,
      changes,
    });

    await logAdminAction({
      actor,
      action: "blog.delete",
      targetType: "blog_post",
      targetId: id,
      details: { commitSha },
    });

    return NextResponse.json({ ok: true, commitSha });
  } catch (error) {
    return NextResponse.json(
      { error: `Delete failed: ${(error as Error)?.message ?? String(error)}` },
      { status: 502 },
    );
  }
}

// HEAD-style existence check for a binary file (getTextFile would decode it as
// text, which is wasteful but harmless; we only need the 404 signal).
async function getTextFileExists(path: string): Promise<boolean> {
  try {
    return (await getTextFile(path)) !== null;
  } catch {
    return false;
  }
}
