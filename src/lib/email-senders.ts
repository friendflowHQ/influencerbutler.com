// Central resolution of the "from" address and Resend API key per sending
// stream. Three streams, kept apart so cold-outreach reputation never touches
// the transactional path:
//
//   - transactional: account-required mail (magic sign-in links, receipts,
//     license keys, staff invites, financial/tax docs, owner alerts). Its own
//     verified domain and (when set) its own Resend API key.
//   - lifecycle: marketing to KNOWN users (funnels, newsletter, testimonial,
//     cancel survey, referral, community, affiliate activation/resources).
//     Stays on the brand domain and keeps the unsubscribe affordance.
//   - cold: cold sequences + campaigns to non-customers. Its own domain; while
//     EMAIL_FROM_COLD is unset the cold stream is PAUSED and callers must skip
//     the send rather than fall back to the brand domain.
//
// Every value is env-backed with a safe default, so nothing breaks before the
// dedicated domains are verified. Functions (not constants) so tests and
// serverless cold starts read the current env. Server env lives in the Vercel
// dashboard, not in git.

export type EmailStream = "transactional" | "lifecycle" | "cold";

/** The brand sender used as the pre-cutover default for transactional and
 * lifecycle mail, matching the address everything sent from historically. */
export const DEFAULT_BRAND_FROM = "Influencer Butler <hello@influencerbutler.com>";

/** Sender for account-required transactional mail. */
export function transactionalFrom(): string {
  return process.env.EMAIL_FROM_TRANSACTIONAL || DEFAULT_BRAND_FROM;
}

/** Sender for lifecycle marketing to known users. */
export function lifecycleFrom(): string {
  return process.env.EMAIL_FROM_LIFECYCLE || DEFAULT_BRAND_FROM;
}

/** Sender for cold outreach. Empty string when the cold stream is unconfigured
 * (paused): callers MUST treat "" as "do not send" rather than falling back to
 * the brand domain. */
export function coldFrom(): string {
  return process.env.EMAIL_FROM_COLD || "";
}

/** True when the cold-outreach stream has a verified sender configured. When
 * false, cold sequences and campaigns are paused. */
export function coldStreamEnabled(): boolean {
  return coldFrom().trim().length > 0;
}

/**
 * The "from" address for a stream. For cold this can be "" (paused); callers
 * gate on coldStreamEnabled() before sending.
 */
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
 * Sender for the Nov 2026 price lock push (owner decision, 2026-11-12):
 *
 *   - Segments A-D (leads, paying, comps, cancelled) are people who already
 *     know us, so they go out from the MAIN address, the same sender and Resend
 *     key as receipts-style transactional mail (license keys, sign-in links),
 *     never from the lifecycle/news subdomain.
 *   - Any audience that touches a cold segment (E1, E2, E3) is cold: it uses the
 *     cold sender only, and is PAUSED (null) while no cold sender is configured.
 *     It never falls back to the main domain.
 *
 * The send itself still goes through sendMarketingEmail, so the unsubscribe
 * footer, one-click List-Unsubscribe headers and daily gates are unchanged.
 */
export function priceLockSender(segments: readonly string[]): { from: string; stream: EmailStream } | null {
  const cold = segments.some((s) => /^E/i.test(s));
  if (cold) return coldStreamEnabled() ? { from: coldFrom(), stream: "cold" } : null;
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
