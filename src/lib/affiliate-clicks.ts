// Helpers for classifying affiliate share-link clicks.
//
// Bucketing rule for the `source` column on affiliate_clicks:
//   1. If the affiliate appended ?s=<slug> to their link, that slug wins
//      (validated against CHANNEL_SLUGS).
//   2. Otherwise we look at the HTTP Referer / document.referrer host and
//      match it against REFERRER_PLATFORMS.
//   3. Empty referrer (typed URL, app open, stripped) → 'direct'.
//   4. Non-empty but unmatched referrer → 'other'.

export const CHANNEL_SLUGS = [
  "instagram",
  "tiktok",
  "youtube",
  "twitter",
  "facebook",
  "pinterest",
  "email",
  "blog",
] as const;

export type ChannelSlug = (typeof CHANNEL_SLUGS)[number];

/**
 * 8 user-facing channels for the dashboard's Link Builder. Order shown in UI.
 * `slug` is what goes into `?s=`; `label` is the pill text.
 */
export const LINK_BUILDER_CHANNELS: { slug: ChannelSlug; label: string }[] = [
  { slug: "instagram", label: "Instagram" },
  { slug: "tiktok", label: "TikTok" },
  { slug: "youtube", label: "YouTube" },
  { slug: "twitter", label: "Twitter / X" },
  { slug: "facebook", label: "Facebook" },
  { slug: "pinterest", label: "Pinterest" },
  { slug: "email", label: "Email" },
  { slug: "blog", label: "Blog / Website" },
];

// Hostname substrings → bucket. First match wins (so put longer prefixes
// first if they would otherwise overlap).
const REFERRER_PLATFORMS: { match: RegExp; source: ChannelSlug | "linkedin" | "reddit" | "snapchat" | "whatsapp" | "telegram" | "discord" | "slack" }[] = [
  { match: /(^|\.)instagram\.com$/, source: "instagram" },
  { match: /(^|\.)l\.instagram\.com$/, source: "instagram" },
  { match: /(^|\.)tiktok\.com$/, source: "tiktok" },
  { match: /(^|\.)youtube\.com$/, source: "youtube" },
  { match: /(^|\.)youtu\.be$/, source: "youtube" },
  { match: /(^|\.)twitter\.com$/, source: "twitter" },
  { match: /(^|\.)x\.com$/, source: "twitter" },
  { match: /(^|\.)t\.co$/, source: "twitter" },
  { match: /(^|\.)facebook\.com$/, source: "facebook" },
  { match: /(^|\.)l\.facebook\.com$/, source: "facebook" },
  { match: /(^|\.)m\.facebook\.com$/, source: "facebook" },
  { match: /(^|\.)pinterest\.com$/, source: "pinterest" },
  { match: /(^|\.)pin\.it$/, source: "pinterest" },
  { match: /(^|\.)linkedin\.com$/, source: "linkedin" },
  { match: /(^|\.)lnkd\.in$/, source: "linkedin" },
  { match: /(^|\.)reddit\.com$/, source: "reddit" },
  { match: /(^|\.)redd\.it$/, source: "reddit" },
  { match: /(^|\.)snapchat\.com$/, source: "snapchat" },
  { match: /(^|\.)whatsapp\.com$/, source: "whatsapp" },
  { match: /(^|\.)t\.me$/, source: "telegram" },
  { match: /(^|\.)telegram\.org$/, source: "telegram" },
  { match: /(^|\.)discord\.com$/, source: "discord" },
  { match: /(^|\.)slack\.com$/, source: "slack" },
];

export type BucketedSource =
  | ChannelSlug
  | "linkedin"
  | "reddit"
  | "snapchat"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "slack"
  | "direct"
  | "other";

/**
 * Normalizes a user-supplied ?s= value. Returns the slug if valid, null if
 * empty/missing, "other" if non-empty but unknown. Lowercased + trimmed.
 */
export function normalizeSource(raw: string | null | undefined): BucketedSource | null {
  if (!raw) return null;
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return null;
  if (trimmed.length > 32) return "other";
  if (!/^[a-z0-9_-]+$/.test(trimmed)) return "other";
  if ((CHANNEL_SLUGS as readonly string[]).includes(trimmed)) {
    return trimmed as ChannelSlug;
  }
  // Allow the extended REFERRER_PLATFORMS source names as ?s= values too,
  // for affiliates who run their own LinkedIn / Reddit campaigns.
  const extended = ["linkedin", "reddit", "snapchat", "whatsapp", "telegram", "discord", "slack"];
  if (extended.includes(trimmed)) return trimmed as BucketedSource;
  return "other";
}

/**
 * Pulls a clean host out of a referrer URL string. Returns null if the URL
 * is missing, malformed, or empty. Lowercased.
 */
export function extractReferrerHost(rawReferrer: string | null | undefined): string | null {
  if (!rawReferrer || rawReferrer.length === 0) return null;
  try {
    const url = new URL(rawReferrer);
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Picks the final source bucket given (explicit ?s= value, referrer host).
 * - Explicit source wins if set.
 * - Else classify by referrer host.
 * - Empty referrer → 'direct'.
 * - Unknown referrer host → 'other'.
 */
export function classifySource(
  explicit: BucketedSource | null,
  referrerHost: string | null,
): BucketedSource {
  if (explicit) return explicit;
  if (!referrerHost) return "direct";
  for (const entry of REFERRER_PLATFORMS) {
    if (entry.match.test(referrerHost)) return entry.source;
  }
  return "other";
}

const BOT_UA_PATTERNS = [
  "bot",
  "crawl",
  "spider",
  "preview",
  "fetch",
  "headless",
  "phantomjs",
  "facebookexternalhit",
  "slackbot",
  "discordbot",
  "telegrambot",
  "whatsapp",
  "twitterbot",
  "linkedinbot",
  "embedly",
  "pingdom",
  "uptimerobot",
];

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  const lower = ua.toLowerCase();
  return BOT_UA_PATTERNS.some((p) => lower.includes(p));
}

/**
 * Human-friendly label for a source bucket. Used in dashboard charts.
 */
export function labelForSource(source: string): string {
  switch (source) {
    case "instagram": return "Instagram";
    case "tiktok": return "TikTok";
    case "youtube": return "YouTube";
    case "twitter": return "Twitter / X";
    case "facebook": return "Facebook";
    case "pinterest": return "Pinterest";
    case "email": return "Email";
    case "blog": return "Blog / Website";
    case "linkedin": return "LinkedIn";
    case "reddit": return "Reddit";
    case "snapchat": return "Snapchat";
    case "whatsapp": return "WhatsApp";
    case "telegram": return "Telegram";
    case "discord": return "Discord";
    case "slack": return "Slack";
    case "direct": return "Direct / typed";
    case "other": return "Other";
    default: return source;
  }
}
