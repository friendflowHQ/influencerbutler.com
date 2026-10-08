/**
 * Call topic chips. Customers pick up to MAX_TOPICS of these when they book,
 * and the owner console shows, filters and counts by them. The list is a code
 * constant on purpose: `call_bookings.topics` stores only the stable `key`, so
 * labels, colors and help links can change without touching saved bookings.
 *
 * Every class string below is a full literal so Tailwind's scanner keeps it.
 * Text/background pairs are AA (see the accessibility notes in CLAUDE.md).
 */

export const MAX_TOPICS = 3;

export type CallTopic = {
  key: string;
  label: string;
  /** Tailwind classes for the chip (background + AA text + ring). */
  chipClass: string;
  /** Help & Tutorials slug (under /help/tutorials/) that best answers this topic. */
  helpSlug?: string;
  /** Lower-case keyword pattern used to suggest chips for legacy free-text topics. */
  match: RegExp;
};

export const CALL_TOPICS: readonly CallTopic[] = [
  { key: "facebook-deals", label: "Facebook deals set-up", chipClass: "bg-blue-50 text-blue-700 ring-blue-200", helpSlug: "deals-guided-setup", match: /facebook|\bfb\b/ },
  { key: "deals-butler", label: "Deals Butler", chipClass: "bg-amber-50 text-amber-800 ring-amber-200", helpSlug: "deals", match: /\bdeals?\b|deal butler/ },
  { key: "foyer", label: "Foyer Butler", chipClass: "bg-violet-50 text-violet-700 ring-violet-200", helpSlug: "foyer-butler", match: /foyer/ },
  { key: "instagram", label: "Instagram", chipClass: "bg-pink-50 text-pink-700 ring-pink-200", helpSlug: "instagram", match: /instagram|\big\b/ },
  { key: "amazon", label: "Amazon storefront", chipClass: "bg-orange-50 text-orange-700 ring-orange-200", helpSlug: "amazonbutler", match: /amazon|storefront|creator connections|\bspcc\b|\bcc\b|influencer program/ },
  { key: "mavely-walmart", label: "Walmart or Mavely", chipClass: "bg-teal-50 text-teal-700 ring-teal-200", helpSlug: "walmart-research", match: /mavely|walmart/ },
  { key: "youtube", label: "YouTube", chipClass: "bg-cyan-50 text-cyan-800 ring-cyan-200", helpSlug: "youtube-butler", match: /youtube/ },
  { key: "extension", label: "Chrome extension", chipClass: "bg-indigo-50 text-indigo-700 ring-indigo-200", helpSlug: "extension", match: /extension|chrome/ },
  { key: "billing", label: "Billing or plan", chipClass: "bg-emerald-50 text-emerald-700 ring-emerald-200", helpSlug: "manage-subscription", match: /billing|subscription|\bplan\b|refund|invoice|charge|payment/ },
  { key: "affiliate", label: "Affiliate program", chipClass: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", match: /affiliate|referral|payout/ },
  { key: "broken", label: "Something is broken", chipClass: "bg-red-50 text-red-700 ring-red-200", helpSlug: "update-troubleshooting", match: /broken|not working|doesn'?t work|error|\bbug\b|crash|freez|stuck|fail|won'?t/ },
  { key: "other", label: "Something else", chipClass: "bg-slate-100 text-slate-700 ring-slate-300", match: /$^/ },
];

const BY_KEY = new Map(CALL_TOPICS.map((t) => [t.key, t]));

export function getTopic(key: string): CallTopic | undefined {
  return BY_KEY.get(key);
}

export function topicLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? key;
}

/**
 * Normalizes untrusted input (a request body) into a clean topic list: known
 * keys only, de-duplicated, in the order given, capped at MAX_TOPICS.
 */
export function sanitizeTopics(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const key = v.trim();
    if (BY_KEY.has(key) && !out.includes(key)) out.push(key);
    if (out.length >= MAX_TOPICS) break;
  }
  return out;
}

/**
 * Suggests chips for a legacy free-text topic (rows booked before the dropdown
 * existed). Deterministic keyword matching, no network. A Facebook deals
 * question gets one chip, not two.
 */
export function guessTopics(text: string | null | undefined): string[] {
  const t = (text || "").toLowerCase();
  if (!t.trim()) return [];
  const hits = CALL_TOPICS.filter((c) => c.match.test(t)).map((c) => c.key);
  const out = hits.includes("facebook-deals") ? hits.filter((k) => k !== "deals-butler") : hits;
  return out.slice(0, MAX_TOPICS);
}

export type DisplayTopic = { key: string; label: string; chipClass: string; guessed: boolean };

/**
 * The chips to render for a booking: the customer's picks when present, else
 * suggestions derived from the legacy free-text topic (flagged `guessed`).
 */
export function topicsForBooking(b: { topics?: string[] | null; topic?: string | null }): DisplayTopic[] {
  const picked = sanitizeTopics(b.topics ?? []);
  const keys = picked.length > 0 ? picked : guessTopics(b.topic);
  const guessed = picked.length === 0;
  return keys.flatMap((k) => {
    const t = BY_KEY.get(k);
    return t ? [{ key: t.key, label: t.label, chipClass: t.chipClass, guessed }] : [];
  });
}

/** Comma-separated labels, for plain-text emails. Empty string when none. */
export function topicLabelsText(keys: string[] | null | undefined): string {
  return sanitizeTopics(keys ?? []).map(topicLabel).join(", ");
}

/**
 * True when a Postgres/PostgREST error is the `topics` column being absent.
 * Prod migrations are applied by hand, so every read/write of `topics` must
 * degrade to the pre-migration behavior instead of failing the whole request.
 */
export function isMissingTopicsColumn(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return msg.includes("topics") && (error.code === "42703" || error.code === "PGRST204" || msg.includes("column") || msg.includes("schema cache"));
}
