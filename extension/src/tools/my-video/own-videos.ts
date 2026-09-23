import { contentIdFromVseId } from "../../amazon/creator-hub";

// The creator's OWN video ids, cached in chrome.storage.local so a product page
// can tell which of the videos on a listing is theirs.
//
// Why a cache at all: nothing on an Amazon /dp/ page says "this video is yours".
// The carousel payload carries content ids and creator names for everybody. The
// only way to answer the question without a network call is to have seen the
// creator's own videos somewhere they are unambiguously theirs (Creator Hub, the
// "My content" list, the edit-post page, their own storefront, or the desktop
// app's content ledger) and remember the ids. capture.ts does the seeing; this
// module does the remembering.
//
// Rules, mirroring campaign-radar/video-count-cache.ts:
//  - One storage key holding a map, so a read is one call.
//  - Merge on write, never delete on absence: the manage list is paginated, so
//    "not on this page" must never be read as "no longer mine".
//  - 180-day TTL refreshed on every re-sighting. Videos are long-lived, and an
//    expired id only costs the feature its silence, never a wrong answer.
//  - Capped, expired-first then oldest-first, so it cannot grow without bound.

const KEY = "ibOwnVideos";
const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 3000;
// Re-sighting an unchanged record inside this window is not written back, so an
// idle SPA re-scan does not hit storage on every mutation settle.
const RESIGHT_QUIET_MS = 60 * 60 * 1000;

// Where an id was seen. Kept for debugging and so a later phase can weigh
// sources differently; every source is equally trusted for identity today.
export type OwnVideoSource =
  | "creator-manage"
  | "manage-content"
  | "creator-post"
  | "creator-upload"
  | "storefront"
  | "bridge";

export type OwnVideoRecord = {
  // Bare lowercase id (the `/vdp/<id>` key shape), never the amzn1.vse.video
  // prefix, so every source joins on one spelling.
  contentId: string;
  title: string | null;
  // Tagged ASINs, when the source exposed them (the edit-post upload state
  // does; a manage-list row does not). Empty means "unknown", not "none".
  asins: string[];
  marketplace: string | null;
  source: OwnVideoSource;
  seenAt: number;
};

export type OwnVideoIndex = {
  byContentId: Map<string, OwnVideoRecord>;
  // settings.storefrontHandle, lowercased. The other half of identity: it is
  // what lets the DOM pass recognize the creator's own carousel card.
  handle: string | null;
  // False when there is no evidence source at all (no remembered ids and no
  // handle). The UI must stay silent then: absence of a match would otherwise
  // read as "your video is not on this listing", which we cannot know.
  usable: boolean;
};

type OwnVideoMap = Record<string, OwnVideoRecord>;

const VDP_RE = /\/vdp\/([A-Za-z0-9]{6,})/;
const VDP_QUERY_RE = /[?&]vdp=([A-Za-z0-9]{6,})/;
const BARE_RE = /^[A-Za-z0-9]{16,}$/;

// One spelling for a video id, whatever shape it arrived in: an
// `amzn1.vse.video.<hex>` id, a `/vdp/<id>` URL, or an already-bare id.
// Lowercased so it joins the desktop ledger key and the storefront feed URL.
// Null when there is nothing id-shaped in the input.
export function normalizeOwnId(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const vse = contentIdFromVseId(s);
  if (vse) return vse;
  const vdp = s.match(VDP_RE)?.[1] ?? s.match(VDP_QUERY_RE)?.[1];
  if (vdp) return vdp.toLowerCase();
  return BARE_RE.test(s) ? s.toLowerCase() : null;
}

// Fold a new sighting into a known one. The new sighting wins on recency and
// source, but never destroys detail the old one had: a manage-list row carries
// no ASINs, and it must not blank the ASINs the edit-post page gave us.
export function mergeRecords(
  existing: OwnVideoRecord | undefined,
  incoming: OwnVideoRecord,
  now: number,
): OwnVideoRecord {
  if (!existing) return { ...incoming, seenAt: now };
  return {
    contentId: existing.contentId,
    title: incoming.title ?? existing.title,
    asins: [...new Set([...existing.asins, ...incoming.asins])],
    marketplace: incoming.marketplace ?? existing.marketplace,
    source: incoming.source,
    seenAt: now,
  };
}

// Expired first, then oldest-first down to the cap. Pure so it is testable.
export function pruneRecords(map: OwnVideoMap, now: number, max = MAX_ENTRIES): OwnVideoMap {
  const live = Object.entries(map).filter(([, r]) => now - (r?.seenAt ?? 0) <= TTL_MS);
  if (live.length <= max) return Object.fromEntries(live);
  const keep = live.sort((a, b) => (b[1]?.seenAt ?? 0) - (a[1]?.seenAt ?? 0)).slice(0, max);
  return Object.fromEntries(keep);
}

// Module-level memo so the per-rebuild read on a product page is free (the video
// hydration watcher re-renders the panel every couple of seconds for up to two
// minutes). Invalidated by the storage listener below, so a capture or a bridge
// write from another tab is picked up rather than served stale.
let memo: OwnVideoMap | null = null;
let memoHandle: string | null = null;

export async function loadOwnVideoIndex(handle: string | null): Promise<OwnVideoIndex> {
  memoHandle = normalizeHandle(handle);
  if (!memo) memo = await readMap();
  const now = Date.now();
  const byContentId = new Map<string, OwnVideoRecord>();
  for (const [id, rec] of Object.entries(memo)) {
    if (!rec || now - (rec.seenAt ?? 0) > TTL_MS) continue;
    byContentId.set(id, rec);
  }
  return { byContentId, handle: memoHandle, usable: byContentId.size > 0 || !!memoHandle };
}

// A cheap synchronous marker of what the memo currently holds, folded into the
// product panel's coverage fingerprint so a late-arriving capture (or the
// desktop bridge answering the ownership lookup) triggers a rebuild rather than
// waiting for the next page load.
export function ownIndexStamp(): string {
  return `${memo ? Object.keys(memo).length : -1}:${memoHandle ?? ""}`;
}

export async function rememberOwnVideos(
  records: Array<Omit<OwnVideoRecord, "seenAt">>,
): Promise<void> {
  const incoming = (records ?? []).filter((r) => r && r.contentId);
  if (incoming.length === 0) return;
  try {
    const now = Date.now();
    const map = await readMap();
    let changed = false;
    for (const rec of incoming) {
      const id = normalizeOwnId(rec.contentId);
      if (!id) continue;
      const before = map[id];
      const merged = mergeRecords(before, { ...rec, contentId: id, seenAt: now }, now);
      if (
        before &&
        before.title === merged.title &&
        before.asins.length === merged.asins.length &&
        now - before.seenAt < RESIGHT_QUIET_MS
      ) {
        continue;
      }
      map[id] = merged;
      changed = true;
    }
    if (!changed) return;
    const pruned = pruneRecords(map, now);
    memo = pruned;
    await chrome.storage.local.set({ [KEY]: pruned });
  } catch {
    /* best-effort: a failed write only costs the feature its silence */
  }
}

async function readMap(): Promise<OwnVideoMap> {
  try {
    const got = await chrome.storage.local.get(KEY);
    const raw = got?.[KEY];
    return raw && typeof raw === "object" ? (raw as OwnVideoMap) : {};
  } catch {
    return {};
  }
}

function normalizeHandle(handle: string | null): string | null {
  const s = String(handle ?? "").trim().toLowerCase();
  return s || null;
}

try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[KEY]) return;
    const next = changes[KEY]?.newValue;
    memo = next && typeof next === "object" ? (next as OwnVideoMap) : {};
  });
} catch {
  /* no storage events in this context: the memo simply lives for the page */
}
