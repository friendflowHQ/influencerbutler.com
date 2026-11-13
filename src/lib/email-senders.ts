// Central resolution of the "from" address and Resend API key per sending
// stream. Three streams:
//
//   - transactional: account-required mail (magic sign-in links, license keys,
//     staff invites, financial/tax docs, owner alerts).
//   - lifecycle: marketing to KNOWN users (funnels, newsletter, testimonial,
//     cancel survey, referral, community, affiliate activation/resources).
//     Keeps the unsubscribe affordance.
//   - cold: cold sequences + campaigns to non-customers.
//
// SENDERS (owner, 2026-11-12/13): transactional and lifecycle mail, including
// the price lock push to segments A-D, send from MAIN_FROM,
// hello@influencerbutler.com. Cold mail (the "cold" stream and price lock
// E1-E3) sends from COLD_FROM on the separate news. subdomain and never from the
// main domain. The EMAIL_FROM_* env vars are deliberately IGNORED so a stale
// Vercel value can never move mail. Streams still pick their Resend API key.

export type EmailStream = "transactional" | "lifecycle" | "cold";

/** The one sender every email uses. */
export const MAIN_FROM = "Influencer Butler <hello@influencerbutler.com>";

/** Kept for existing callers and tests: same as MAIN_FROM. */
export const DEFAULT_BRAND_FROM = MAIN_FROM;

/** Sender for account-required transactional mail. */
export function transactionalFrom(): string {
  return MAIN_FROM;
}

/** Sender for lifecycle marketing to known users. */
export function lifecycleFrom(): string {
  return MAIN_FROM;
}

/** Cold outreach sender on a SEPARATE subdomain (owner, 2026-11-13): cold mail
 * (price lock E1-E3 and anything on the "cold" stream) never uses the main
 * domain address. news.influencerbutler.com is verified in Resend. */
export const COLD_FROM = "Influencer Butler <hello@news.influencerbutler.com>";

/** Sender for cold outreach: COLD_FROM, never MAIN_FROM. */
export function coldFrom(): string {
  return COLD_FROM;
}

/** The cold stream has its own subdomain sender. The price lock cold groups
 * (E1-E3) are additionally held, see PRICE_LOCK_COLD_HELD. */
export function coldStreamEnabled(): boolean {
  return coldFrom().trim().length > 0;
}

/** The "from" address for a stream. Every stream is MAIN_FROM. */
export function fromForStream(stream: EmailStream): string {
  switch (stream) {
    case "transactional":
      return transactionalFrom();
    case "cold":
      return coldFrom();
    case "lifecycle":
    default:
      return lifecycleFrom();
  }
}

/**
 * Price lock cold groups (E1, E2, E3) stay ON HOLD until the owner approves the
 * deliverability fixes (owner, 2026-11-12/13). Flip to false in a reviewed
 * commit to release them; they then send from COLD_FROM (news. subdomain).
 */
export const PRICE_LOCK_COLD_HELD = true;

/**
 * Sender for the Nov 2026 price lock push. A-D: the main address on the
 * transactional stream (same Resend key as license keys and sign-in links).
 * Any audience touching E1-E3: null (held) while PRICE_LOCK_COLD_HELD, then
 * COLD_FROM on the cold stream. E1-E3 never get the main address.
 *
 * The send itself still goes through sendMarketingEmail, so the unsubscribe
 * footer, one-click List-Unsubscribe headers and daily gates are unchanged.
 */
export function priceLockSender(segments: readonly string[]): { from: string; stream: EmailStream } | null {
  const cold = segments.some((s) => /^E/i.test(s));
  if (cold) return PRICE_LOCK_COLD_HELD ? null : { from: coldFrom(), stream: "cold" };
  return { from: transactionalFrom(), stream: "transactional" };
}

/**
 * Resend API key for a stream. Transactional uses a dedicated key when set so
 * it sends from its own verified domain and reputation; lifecycle and cold use
 * the main key (cold can gain its own later without touching callers).
 */
export function resendKeyFor(stream: EmailStream | undefined): string | undefined {
  if (stream === "transactional") {
    return process.env.RESEND_API_KEY_TRANSACTIONAL || process.env.RESEND_API_KEY;
  }
  return process.env.RESEND_API_KEY;
}
