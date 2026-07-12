// Pure helper functions for the Instagram Goldmine crawl: username / hashtag
// normalization, count parsing, email extraction, follower cap, engagement
// math, dedup keys, and a CSV string builder. Ported almost verbatim from the
// desktop app's workspaces/instagram-goldmine/instagram-helpers.js so the two
// surfaces match the same addresses and behave identically. No DOM, no chrome
// APIs, no I/O, so vitest can exercise them without a browser.

export function normalizeUsername(input: string | null | undefined): string {
  if (input == null) return "";
  return String(input)
    .trim()
    .replace(/^@/, "")
    .replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "")
    .replace(/^\/+|\/+$/g, "")
    .split(/[/?#]/)[0]!
    .toLowerCase();
}

// Normalize a hashtag the user typed (or pasted as an explore URL) into the
// bare tag Instagram's /explore/tags/<tag>/ route expects. Returns "" for
// anything that is not a usable single tag.
export function normalizeHashtag(input: string | null | undefined): string {
  if (input == null) return "";
  let text = String(input).trim();
  if (!text) return "";
  const urlMatch = text.match(/explore\/tags\/([^/?#]+)/i);
  if (urlMatch) text = urlMatch[1]!;
  text = text.replace(/^#+/, "").trim();
  if (/\s/.test(text)) return "";
  text = text.replace(/[^\wÀ-ɏ]/g, "");
  return text.toLowerCase();
}

export function parseCount(rawText: string | number | null | undefined): number | null {
  if (rawText == null) return null;
  const text = String(rawText).trim().replace(/,/g, "");
  if (!text) return null;
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*([KMB])?$/i);
  if (!match) {
    const plain = Number.parseInt(text, 10);
    return Number.isFinite(plain) ? plain : null;
  }
  const value = Number.parseFloat(match[1]!);
  if (!Number.isFinite(value)) return null;
  const suffix = (match[2] || "").toUpperCase();
  switch (suffix) {
    case "K":
      return Math.round(value * 1_000);
    case "M":
      return Math.round(value * 1_000_000);
    case "B":
      return Math.round(value * 1_000_000_000);
    default:
      return Math.round(value);
  }
}

export function delay(ms: number): Promise<void> {
  const safe = Math.max(0, Math.floor(Number(ms) || 0));
  return new Promise((resolve) => setTimeout(resolve, safe));
}

// Jittered human-pacing sleep. `multiplier` is the safe-mode 2x knob.
export function humanDelay(min = 800, max = 2500, multiplier = 1): Promise<void> {
  const lo = Math.max(0, Math.floor(min * multiplier));
  const hi = Math.max(lo + 1, Math.floor(max * multiplier));
  const ms = Math.floor(Math.random() * (hi - lo)) + lo;
  return delay(ms);
}

// True when an ISO timestamp falls within the last `days` days. `days <= 0`
// means "no recency limit" -> always true. Unparseable timestamps return true
// (keep the post) so a missing/odd date never silently drops data.
export function isWithinRecentDays(
  timestamp: string | number | null | undefined,
  days: number,
  nowMs: number = Date.now(),
): boolean {
  const window = Number(days);
  if (!Number.isFinite(window) || window <= 0) return true;
  const ts =
    typeof timestamp === "number"
      ? timestamp > 1e12
        ? timestamp
        : timestamp * 1000 // IG "taken_at" is unix seconds
      : Date.parse(String(timestamp || ""));
  if (!Number.isFinite(ts)) return true;
  return nowMs - ts <= window * 24 * 60 * 60 * 1000;
}

// True when a creator's follower count is above the "max followers" cap and
// their email should be skipped. `maxFollowers <= 0` means "no cap". An
// unknown/unparseable count returns false (keep the creator).
export function exceedsFollowerCap(
  followerCount: number | null | undefined,
  maxFollowers: number,
): boolean {
  const cap = Number(maxFollowers);
  if (!Number.isFinite(cap) || cap <= 0) return false;
  const count = Number(followerCount);
  if (!Number.isFinite(count)) return false;
  return count > cap;
}

export type EngagementSample = { likeCount: number | null; commentCount: number | null };
export type EngagementResult = {
  engagementRate: number | null;
  engagementBasis: "likes+comments" | "comments-only" | null;
  engagementSampleSize: number;
};

// Compute a creator's engagement rate from a sample of recent posts. Instagram
// hides like counts on many profiles, so the basis auto-falls-back to
// comments-only when the majority of sampled posts hide likes. Never mixes
// bases per account. See the desktop twin for the full rationale.
export function computeEngagementRate(args: {
  samples: EngagementSample[];
  followerCount: number;
}): EngagementResult {
  const list = Array.isArray(args?.samples) ? args.samples : [];
  const followers = Number(args?.followerCount);
  const sampleSize = list.length;

  const empty: EngagementResult = {
    engagementRate: null,
    engagementBasis: null,
    engagementSampleSize: sampleSize,
  };
  if (!sampleSize || !Number.isFinite(followers) || followers <= 0) return empty;

  const commentsOf = (post: EngagementSample): number => {
    const n = Number(post && post.commentCount);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };
  const withLikes = list.filter((post) => {
    if (post == null || post.likeCount == null) return false;
    const n = Number(post.likeCount);
    return Number.isFinite(n) && n >= 0;
  });

  const round2 = (value: number): number => Math.round(value * 100) / 100;

  if (withLikes.length >= Math.ceil(sampleSize / 2)) {
    const total = withLikes.reduce(
      (sum, post) => sum + (Number(post.likeCount) + commentsOf(post)) / followers,
      0,
    );
    return {
      engagementRate: round2((total / withLikes.length) * 100),
      engagementBasis: "likes+comments",
      engagementSampleSize: sampleSize,
    };
  }

  const total = list.reduce((sum, post) => sum + commentsOf(post) / followers, 0);
  return {
    engagementRate: round2((total / sampleSize) * 100),
    engagementBasis: "comments-only",
    engagementSampleSize: sampleSize,
  };
}

// Composite dedupe key pairing a creator handle with one email, so a given
// (username, email) is only ever harvested once across a run.
export function emailDedupeKey(username: string, email: string): string {
  return `${normalizeUsername(username)}::${String(email || "").trim().toLowerCase()}`;
}

// Email pattern, copied verbatim from the desktop harvesters so all surfaces
// match the same addresses. Global so `.match()` returns every hit.
export const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Pull every email out of a blob of profile/bio text, lowercased and deduped.
export function extractEmailsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const matches = String(text).match(EMAIL_RE) || [];
  return Array.from(new Set(matches.map((m) => m.toLowerCase())));
}

// Lift the address out of a `mailto:` href (the form IG's professional-account
// "Email" contact button renders as). Strips any query and URL-decodes.
export function parseMailtoEmail(href: string | null | undefined): string {
  if (!href) return "";
  const raw = String(href).trim();
  if (!/^mailto:/i.test(raw)) return "";
  let addr = raw.slice("mailto:".length).split("?")[0]!.trim();
  try {
    addr = decodeURIComponent(addr);
  } catch {
    /* keep raw */
  }
  return extractEmailsFromText(addr)[0] || "";
}

// Turn a raw bio-link value into a safe absolute http(s) URL, or "" when it is
// not a followable web link (rejects mailto:/tel:/javascript: etc.).
export function normalizeBioLinkUrl(raw: string | null | undefined): string {
  if (!raw) return "";
  let candidate = String(raw).trim();
  if (!candidate) return "";
  if (/^(mailto|tel|javascript|data|file|ftp):/i.test(candidate)) return "";
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    if (!url.hostname) return "";
    return url.href;
  } catch {
    return "";
  }
}

// Decode Instagram's l.instagram.com/?...&u=<target> bio-link redirect back to
// the real external URL. Returns the input untouched when it is not a redirect.
export function decodeBioLinkRedirect(raw: string | null | undefined): string {
  if (!raw) return "";
  const text = String(raw).trim();
  try {
    const url = new URL(text, "https://www.instagram.com");
    if (/(^|\.)l\.instagram\.com$/i.test(url.hostname)) {
      const target = url.searchParams.get("u");
      if (target) return target;
    }
  } catch {
    /* fall through to raw */
  }
  return text;
}

export function buildProfileUrl(username: string): string {
  const clean = normalizeUsername(username);
  return clean ? `https://www.instagram.com/${clean}/` : "";
}

// One CSV cell, quoted only when it contains a comma, quote, or newline.
function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /["\n,]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Build a CSV string (not a file: the extension downloads it via a Blob URL).
// `columns` is an ordered list of keys; array values join with "; ".
export function buildCsv(
  records: Array<Record<string, unknown>>,
  columns: string[],
): string {
  const first = records[0];
  const cols = columns.length > 0 ? columns : first ? Object.keys(first) : [];
  const lines = [cols.map(csvCell).join(",")];
  for (const row of records) {
    lines.push(
      cols
        .map((key) => {
          const value = row?.[key];
          if (Array.isArray(value)) return csvCell(value.join("; "));
          return csvCell(value);
        })
        .join(","),
    );
  }
  return lines.join("\n");
}
