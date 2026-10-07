// Content-link submit: the pure half (no DOM, no storage I/O beyond the plain
// ledger shape). After a Creator Connections campaign is accepted, Amazon wants
// the creator's proof of content: a link to the video / post that features the
// product, entered on the campaign's detail page. This module decides WHAT to
// submit and WHEN; tools/campaign-radar/content-link-runner.ts drives the page and
// background/content-link.ts orchestrates the tabs.
//
// Rules ported from the desktop app's CC Check (workspaces/cc-check/
// cc-check-runner.js + lib/best-campaign.js), which are verified live:
//  - the link's type is chosen by host from Amazon's own dropdown option list;
//  - when an ASIN has several active campaigns, submit to the BEST one only
//    (open before known-full, then latest end date, then highest commission,
//    then card order): hundreds of campaigns on one ASIN would take hours and
//    risk Amazon rate thresholds;
//  - a URL already shown as submitted is never submitted again.

// ---- Content type (Amazon's dropdown options) --------------------------------

// The live dropdown options (lowercased, exactly as the runner matches them):
// article or blog post, video, instagram post, instagram story, youtube video,
// tiktok video, twitter post, facebook story, facebook post, social media post,
// email newsletter.
export type ContentType =
  | "video"
  | "youtube video"
  | "tiktok video"
  | "instagram post"
  | "instagram story"
  | "facebook post"
  | "facebook story"
  | "twitter post"
  | "social media post"
  | "article or blog post";

// Pure: which dropdown option a published-post URL is submitted under. The
// creator's own Amazon storefront videos (the only links Auto mode submits)
// resolve to "video"; the other hosts are for one-off links. Unknown hosts fall
// back to "social media post"; a blank / hostless URL keeps the "video" default.
export function detectContentType(url: string): ContentType {
  const raw = typeof url === "string" ? url.trim() : "";
  if (!raw) return "video";
  let host = "";
  let path = "";
  try {
    const parsed = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    path = parsed.pathname.toLowerCase();
  } catch {
    return "video";
  }
  if (!host) return "video";
  const isStory = /(^|\/)stories?(\/|$)/.test(path);

  if (host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com")) {
    return "youtube video";
  }
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok video";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return isStory ? "instagram story" : "instagram post";
  }
  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host === "fb.watch"
  ) {
    return isStory ? "facebook story" : "facebook post";
  }
  if (host === "twitter.com" || host.endsWith(".twitter.com") || host === "x.com" || host.endsWith(".x.com")) {
    return "twitter post";
  }
  if (/(^|\.)amazon\.[a-z.]+$/.test(host)) {
    // Amazon storefront content: /video paths are videos; posts / photos / idea
    // lists have no dedicated option, so the generic social type is the fit.
    return /\/(video|videos|vdp)(\/|$)/.test(path) ? "video" : "social media post";
  }
  return "social media post";
}

// ---- Best campaign -------------------------------------------------------------

// One active-campaign card as scraped off the (ASIN-filtered) Active tab.
export type ActiveCardMeta = {
  index: number;
  href: string;
  campaignId: string;
  dateRange: string;
  cardText: string;
  // True when the fill capture says the campaign has no creator slots left.
  full?: boolean;
};

export type RankedCard = ActiveCardMeta & {
  endMs: number | null;
  commissionPercent: number | null;
};

const DATE_TOKEN_RE = /(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/g;
const PERCENT_TOKEN_RE = /(\d{1,3}(?:[.,]\d+)?)\s*%/g;

// Pure: the END date (epoch ms) of a card date range like "6/1/26 - 9/30/26", or
// null when nothing parseable is present (a rolled-over date like 2/31 is
// rejected).
export function parseDateRangeEnd(dateRange: string): number | null {
  if (!dateRange) return null;
  let last: RegExpExecArray | null = null;
  DATE_TOKEN_RE.lastIndex = 0;
  for (let m = DATE_TOKEN_RE.exec(dateRange); m; m = DATE_TOKEN_RE.exec(dateRange)) last = m;
  if (!last) return null;
  const month = Number(last[1]);
  const day = Number(last[2]);
  let year = Number(last[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 100) year += 2000;
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d.getTime();
}

// Pure: the highest plausible commission percent in a card's text, or null.
export function parseCommissionPercent(text: string): number | null {
  if (!text) return null;
  let best: number | null = null;
  PERCENT_TOKEN_RE.lastIndex = 0;
  for (let m = PERCENT_TOKEN_RE.exec(text); m; m = PERCENT_TOKEN_RE.exec(text)) {
    const value = Number(String(m[1]).replace(",", "."));
    if (!Number.isFinite(value) || value <= 0 || value > 100) continue;
    if (best === null || value > best) best = value;
  }
  return best;
}

// Pure: the best campaign to submit the link to. Open campaigns before
// known-full ones (advisory: the last candidate is never dropped), then the
// latest end date (undated sorts last), then the highest commission, then the
// original card order. Null only when there are no cards.
export function pickBestCampaign(cards: ActiveCardMeta[]): RankedCard | null {
  const list: RankedCard[] = cards
    .filter((c) => Number.isFinite(c.index))
    .map((c) => ({
      ...c,
      endMs: parseDateRangeEnd(c.dateRange),
      commissionPercent: parseCommissionPercent(c.cardText),
    }));
  if (list.length === 0) return null;
  const ranked = list.slice().sort((a, b) => {
    const aFull = a.full === true;
    const bFull = b.full === true;
    if (aFull !== bFull) return aFull ? 1 : -1;
    const aEnd = a.endMs ?? -Infinity;
    const bEnd = b.endMs ?? -Infinity;
    if (aEnd !== bEnd) return bEnd - aEnd;
    const aPct = a.commissionPercent ?? -Infinity;
    const bPct = b.commissionPercent ?? -Infinity;
    if (aPct !== bPct) return bPct - aPct;
    return a.index - b.index;
  });
  return ranked[0] ?? null;
}

// ---- Already-submitted check ---------------------------------------------------

// Pure: lowercase, drop the protocol, a leading "www.", the query / hash and
// trailing slashes.
export function normalizeSubmittedUrl(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[?#].*$/, "")
    .replace(/\/+$/, "");
}

// Pure: is a link shown on the details panel the SAME URL we are about to submit?
// Deliberately strict (exact normalized match): a loose substring match once
// counted any shorter link the content URL happened to contain (the storefront
// link, amazon.com, even the word "video") as "already submitted".
export function submittedUrlMatches(candidate: string, target: string): boolean {
  const a = normalizeSubmittedUrl(candidate);
  const b = normalizeSubmittedUrl(target);
  if (!a || !b) return false;
  // The target must look like host + path, never bare link text.
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+\/./.test(b)) return false;
  return a === b;
}

// Amazon's confirmation banner (English; a localized banner is covered by the
// re-read of the page for the submitted URL).
export const CONTENT_SUBMITTED_RE = /Link was successfully submitted/i;

// ---- Link ledger -----------------------------------------------------------------

export type LinkStatus = "submitted" | "failed" | "no-campaign";

export type LinkLedgerEntry = {
  status: LinkStatus;
  url: string;
  at: number;
  attempts: number;
};

// Keyed by ASIN. Own storage key (LINK_LEDGER_KEY), no schema bump.
export type LinkLedger = Record<string, LinkLedgerEntry>;

export const LINK_LEDGER_KEY = "ib-link-ledger";
// After a failed submit, leave the ASIN alone this long (the desktop backs SPCC
// off 3 days; the same here).
export const LINK_FAIL_BACKOFF_MS = 3 * 24 * 60 * 60 * 1000;
// An ASIN with no ACTIVE campaign yet (a brand that approves manually leaves it
// pending) is re-checked after this long.
export const LINK_NO_CAMPAIGN_RECHECK_MS = 24 * 60 * 60 * 1000;
// At most this many ASINs per pass: each one opens two background pages.
export const LINK_PASS_CAP = 3;
// The ledger keeps at most this many ASINs.
export const LINK_LEDGER_CAP = 2_000;

// Pure: coerce an untrusted stored blob into a ledger (junk entries dropped).
export function readLinkLedger(raw: unknown): LinkLedger {
  if (!raw || typeof raw !== "object") return {};
  const out: LinkLedger = {};
  for (const [asin, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!/^[A-Z0-9]{10}$/.test(asin) || !value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (v.status !== "submitted" && v.status !== "failed" && v.status !== "no-campaign") continue;
    if (typeof v.url !== "string" || typeof v.at !== "number" || !Number.isFinite(v.at)) continue;
    out[asin] = {
      status: v.status,
      url: v.url,
      at: v.at,
      attempts: typeof v.attempts === "number" && v.attempts > 0 ? Math.round(v.attempts) : 1,
    };
  }
  return out;
}

// Pure: should this ASIN get a link submit attempt now?
//  - already submitted the same URL: never again;
//  - submitted a different URL (the creator's newer video): yes, once;
//  - failed: not until the backoff passes;
//  - no active campaign: not until the recheck window passes.
export function shouldSubmitLink(
  entry: LinkLedgerEntry | undefined,
  url: string,
  now: number,
): boolean {
  if (!entry) return true;
  if (entry.status === "submitted") return entry.url !== url;
  if (entry.status === "failed") return now - entry.at >= LINK_FAIL_BACKOFF_MS;
  return now - entry.at >= LINK_NO_CAMPAIGN_RECHECK_MS;
}

// Pure: record an attempt, keeping the attempt count and capping the ledger
// (oldest entries dropped first).
export function recordLinkAttempt(
  ledger: LinkLedger,
  asin: string,
  status: LinkStatus,
  url: string,
  now: number,
): LinkLedger {
  const prior = ledger[asin];
  const next: LinkLedger = {
    ...ledger,
    [asin]: { status, url, at: now, attempts: (prior?.attempts ?? 0) + 1 },
  };
  const keys = Object.keys(next);
  if (keys.length <= LINK_LEDGER_CAP) return next;
  const keep = keys.sort((a, b) => (next[b]?.at ?? 0) - (next[a]?.at ?? 0)).slice(0, LINK_LEDGER_CAP);
  return Object.fromEntries(keep.map((k) => [k, next[k] as LinkLedgerEntry]));
}

// ---- Pending links ---------------------------------------------------------------

export type PendingLink = { asin: string; url: string };

// Pure: the accepted CC campaigns still waiting for a link, capped at `max`.
// `acceptedAsins` are the ASINs of campaigns the creator accepted (newest first);
// `storefront` maps an ASIN to the creator's OWN video URL. An ASIN is pending
// when the creator has a video for it and shouldSubmitLink says it is due. SPCC
// accepts are excluded by the caller (their link flow is not driven here).
export function pendingLinks(
  acceptedAsins: readonly string[],
  storefront: Record<string, { url: string }>,
  ledger: LinkLedger,
  now: number,
  max = Infinity,
): PendingLink[] {
  const out: PendingLink[] = [];
  const seen = new Set<string>();
  for (const raw of acceptedAsins) {
    const asin = raw.trim().toUpperCase();
    if (seen.has(asin)) continue;
    seen.add(asin);
    const video = storefront[asin];
    if (!video) continue;
    if (!shouldSubmitLink(ledger[asin], video.url, now)) continue;
    out.push({ asin, url: video.url });
    if (out.length >= max) break;
  }
  return out;
}
