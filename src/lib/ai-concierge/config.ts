/**
 * Butler AI concierge tunables. All overridable via env so cost/behavior can be
 * adjusted without a code change.
 *
 * Dependencies: none.
 */

/** OpenAI Realtime model for the voice path. */
export const REALTIME_MODEL = process.env.AI_CONCIERGE_REALTIME_MODEL || "gpt-realtime";

/** Realtime output voice. */
export const REALTIME_VOICE = process.env.AI_CONCIERGE_VOICE || "marin";

/** Chat model for the text path (falls back through the Groq/OpenAI resolver). */
export const TEXT_MODEL_OVERRIDE = process.env.AI_CONCIERGE_TEXT_MODEL || "";

/** Hard client-side cap on a single voice session, in seconds (default 10 min). */
export const MAX_SESSION_SECS = num(process.env.AI_CONCIERGE_MAX_SESSION_SECS, 600);

/** Per-user sessions per day (voice + text combined). */
export const DAILY_SESSION_LIMIT = num(process.env.AI_CONCIERGE_DAILY_LIMIT, 5);

function num(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
