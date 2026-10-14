import type { YouTubeStatusRecord } from "../../shared/messages";
import type { YouTubeStatusLookup, YouTubeProgressLookup } from "./status";

// The three chip states for a video's YouTube presence:
// - "on":      uploaded (or draft) with a YouTube link -> green, links out.
// - "off":     paired, no upload record (or a failed one) -> amber, offers Upload.
// - "unknown": the desktop app is not paired/running -> muted "connect the app".
export type YouTubeChipState = "on" | "off" | "unknown";

export type YouTubeChip = {
  state: YouTubeChipState;
  record: YouTubeStatusRecord | null;
};

// Pure mapping from a contentId + a resolved lookup to the chip to render. Kept
// separate from the DOM so it is unit-testable. An unpaired lookup is always
// "unknown" (we cannot know upload status without the app); a paired lookup is
// "on" only when a record says the video is on YouTube, else "off" (which still
// carries any failed record so the chip can say "retry").
export function youtubeChipState(contentId: string, lookup: YouTubeStatusLookup): YouTubeChip {
  const cid = String(contentId || "").trim().toLowerCase();
  if (!cid || !lookup.paired) return { state: "unknown", record: null };
  const record = lookup.byId.get(cid) || null;
  if (record && record.onYouTube) return { state: "on", record };
  return { state: "off", record };
}

// Which label the "Uploading" button should show while polling, kept as a
// discriminated kind (not a localized string) so the selection logic is
// unit-testable without pulling in i18n; the overlay maps each kind to a
// t().yt* string. Priority: unpaired/unknown first (we genuinely don't know),
// then the daily cap (an honest "not stuck, just capped" state), then real
// running numbers, else a plain "queued" fallback.
export type YouTubeProgressLabelKind =
  | { kind: "not-paired" }
  | { kind: "cap-reached" }
  | { kind: "running"; usedToday: number; cap: number; queued: number }
  | { kind: "idle" };

export function youtubeProgressLabelKind(progress: YouTubeProgressLookup): YouTubeProgressLabelKind {
  const snap = progress.snapshot;
  if (!progress.paired || !snap) return { kind: "not-paired" };
  if (snap.capReached) return { kind: "cap-reached" };
  if (snap.running) return { kind: "running", usedToday: snap.usedToday, cap: snap.cap, queued: snap.queued };
  return { kind: "idle" };
}

// The on-Amazon "showing on detail pages" signal, read from the page DOM (no
// bridge). Amazon shows a "Reach more shoppers with this video" / "Published but
// not showing on detail pages" banner when a published video fails its quality
// bar. This is a pure classifier over the signals the overlay scrapes:
// - notShowing true  -> the banner/label is present -> "not-showing" (amber).
// - published true, no banner -> "showing" (green).
// - otherwise -> "unknown" (draft/not-published, or we could not read a signal).
export type AmazonShowingState = "showing" | "not-showing" | "unknown";

export function amazonShowingState(signals: {
  published?: boolean;
  notShowing?: boolean;
}): AmazonShowingState {
  if (signals?.notShowing) return "not-showing";
  if (signals?.published) return "showing";
  return "unknown";
}

// The kind of content the reach banner is about, so the fix checklist can speak
// to a video or a photo specifically (falls back to neutral "content").
export type ReachContentKind = "video" | "photo" | "content";

// Amazon's held-back-from-detail-pages banner, parsed from page/row text. On the
// item edit page (/create/post) Amazon spells out the reason in the shape:
//   "This video isn't being shown on product detail pages because it doesn't
//    meet our video quality bar. ... To improve its reach, ... delete this video
//    and upload an improved version. New uploads are evaluated within 48 hours."
// On the list surfaces (manage-content, creatorhub/manage) only the compact
// "Improve reach" affordance is present, with no "because" clause, so `reason` is
// null there and the chip falls back to a localized generic reason.
export type ReachBanner = {
  notShowing: boolean;
  kind: ReachContentKind;
  reason: string | null; // Amazon's own words after "... because", when present.
};

// Pure parser over a scope's text. Locale-tolerant on the English phrasing Amazon
// ships today; degrades to notShowing:false when no reach signal is present.
export function parseReachBanner(rawText: string): ReachBanner {
  const text = String(rawText || "").replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();
  const notShowing =
    low.includes("improve reach") ||
    low.includes("isn't being shown on product detail") ||
    low.includes("is not being shown on product detail") ||
    low.includes("not being shown on product detail") ||
    low.includes("published but not showing") ||
    low.includes("reach more shoppers with this");
  if (!notShowing) return { notShowing: false, kind: "content", reason: null };

  let kind: ReachContentKind = "content";
  if (/\bthis (video|reel|clip)\b/i.test(text) || low.includes("video quality bar")) {
    kind = "video";
  } else if (
    /\bthis (photo|image|picture)\b/i.test(text) ||
    low.includes("photo quality bar") ||
    low.includes("image quality bar")
  ) {
    kind = "photo";
  }

  // Anchor the reason clause on the detail-pages phrase so an unrelated "because"
  // elsewhere in the page text is never picked up. Trim to the first sentence.
  let reason: string | null = null;
  const m = text.match(/product detail pages,?\s+because\s+(.+?)\.(?:\s|$)/i);
  if (m && m[1]) reason = m[1].trim().replace(/\s+/g, " ");
  return { notShowing: true, kind, reason };
}
