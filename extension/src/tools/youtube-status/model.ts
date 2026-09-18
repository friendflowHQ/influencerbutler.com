import type { YouTubeStatusRecord } from "../../shared/messages";
import type { YouTubeStatusLookup } from "./status";

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
