// Title-case a content-coverage platform slug for display (e.g. "youtube" ->
// "YouTube", "facebook" -> "Facebook"). A small set of brand names get their
// canonical casing; everything else is capitalized generically.
const CANONICAL: Record<string, string> = {
  youtube: "YouTube",
  amazon: "Amazon",
  facebook: "Facebook",
  instagram: "Instagram",
  telegram: "Telegram",
  reddit: "Reddit",
  benable: "Benable",
  tiktok: "TikTok",
  pinterest: "Pinterest",
};

export function prettyPlatform(platform: string): string {
  const s = String(platform || "").trim();
  if (!s) return "";
  const key = s.toLowerCase();
  if (CANONICAL[key]) return CANONICAL[key];
  return s.charAt(0).toUpperCase() + s.slice(1);
}
