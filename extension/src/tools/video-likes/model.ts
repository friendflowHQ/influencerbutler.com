// Pure helpers for the Video Likes overlay (Amazon per-video "like" / heart
// count). No DOM here, so the parse/format logic is unit-tested in isolation
// from the injection code.

// Parse a like count out of Amazon's own rendered heart-count text ("9",
// "1,234", "1.2K"), or null when it is empty / not a number. Amazon abbreviates
// large counts, so accept a trailing k/m multiplier.
export function parseLikeCount(text: string | null | undefined): number | null {
  if (text == null) return null;
  const cleaned = String(text).replace(/[,\s]/g, "").toLowerCase();
  const match = cleaned.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!match) return null;
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return null;
  const mult = match[2] === "m" ? 1_000_000 : match[2] === "k" ? 1000 : 1;
  return Math.round(base * mult);
}

// Format a like count for the badge: exact under 1000, then "1.2k" / "12k" for
// larger numbers so the pill stays narrow over a thumbnail. Never rounds a real
// count up to a fake milestone.
export function formatLikeCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  const thousands = v / 1000;
  // One decimal below 10k ("1.2k", "9.9k"); whole thousands above ("12k").
  const label =
    thousands < 10 ? thousands.toFixed(1).replace(/\.0$/, "") : String(Math.floor(thousands));
  return `${label}k`;
}
