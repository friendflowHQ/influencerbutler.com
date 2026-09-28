import type { CarouselVideo } from "./video-carousel";

// A stable identity for a creator video, used to track the same video across
// page loads and days in the shared video-placement pool. Most reliable first:
//   1. the Amazon content id (aciContentId), when the state-script list was the
//      source: this is Amazon's own durable id and never collides.
//   2. a video-detail id parsed from the video URL (/vdp/<id> or ?vdp=<id>).
//   3. a "t:" prefixed hash of creator name + title, self-labeling as a weak,
//      collision-prone fallback so downstream can treat it with lower trust.
// Returns null only when there is nothing at all to identify the video by.
export function deriveVideoId(v: CarouselVideo): string | null {
  if (v.contentId) return v.contentId.toLowerCase();
  const fromUrl = videoIdFromUrl(v.url);
  if (fromUrl) return fromUrl;
  const name = (v.creatorName ?? "").trim().toLowerCase();
  const title = (v.title ?? "").trim().toLowerCase();
  if (!name && !title) return null;
  return `t:${hash(`${name}|${title}`)}`;
}

// A stable-ish creator id. We do not parse a real profile id today, so this is
// name-derived and prefixed "n:" to keep it from being mistaken for a durable
// Amazon profile id. Null when the creator is unnamed.
export function deriveCreatorId(v: CarouselVideo): string | null {
  const name = (v.creatorName ?? "").trim().toLowerCase();
  if (!name) return null;
  return `n:${hash(name)}`;
}

function videoIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const vdp = url.match(/\/vdp\/([A-Za-z0-9]{6,})/) ?? url.match(/[?&]vdp=([A-Za-z0-9]{6,})/);
  return vdp ? `vdp:${vdp[1]!.toLowerCase()}` : null;
}

// Small, stable, non-crypto string hash (djb2). Not for security, only to give
// a name/title-derived fallback id a compact stable form.
function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  // Unsigned hex.
  return (h >>> 0).toString(16);
}
