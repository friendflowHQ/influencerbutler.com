// Amazon's Creator Hub "Audio suppressed" badge, parsed from row/page text. On
// the /manage-content list, a row whose uploaded video had its audio muted by
// Amazon (a copyright claim, a policy strike, etc.) shows "Audio suppressed" in
// the Notifications column alongside the ordinary status/view text. This is a
// pure, selector-free classifier (mirrors parseReachBanner in
// ../youtube-status/model): normalize whitespace and case, then look for the
// phrase. Degrades to false when the phrase is absent, so a markup revision
// never produces a false positive.
export function parseAudioSuppressed(rawText: string): boolean {
  const text = String(rawText || "").replace(/\s+/g, " ").trim();
  const low = text.toLowerCase();
  return low.includes("audio suppressed");
}
