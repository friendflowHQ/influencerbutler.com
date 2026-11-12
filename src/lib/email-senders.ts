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
// ONE SENDER FOR EVERYTHING (owner decision, 2026-11-12): every stream sends
// from MAIN_FROM, hello@influencerbutler.com. The EMAIL_FROM_TRANSACTIONAL /
// EMAIL_FROM_LIFECYCLE / EMAIL_FROM_COLD env vars are deliberately IGNORED so a
// stale Vercel value (lifecycle pointed at news.influencerbutler.com) can never
// move mail off the main address. Streams still pick their Resend API key and
// keep their own gates; only the "from" is unified.

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

/** Sender for cold outreach. Same main address as everything else. */
export function coldFrom(): string {
  return MAIN_FROM;
}

/** Cold sequences and campaigns have a sender (the main address), so the cold
 * stream is no longer paused for lack of one. The price lock cold groups
 * (E1-E3) are held separately, see PRICE_LOCK_COLD_HELD. */
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
 * deliverability fixes (owner, 2026-11-12). Flip to false in a reviewed commit
 * to release them; they then send from the main address like everything else.
 */
export const PRICE_LOCK_COLD_HELD = true;

/**
 * Sender for the Nov 2026 price lock push: the main address for every segment.
 * A-D go on the transactional stream (same Resend key as license keys and
 * sign-in links). Any audience touching E1-E3 returns null (held) while
 * PRICE_LOCK_COLD_HELD is true.
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
