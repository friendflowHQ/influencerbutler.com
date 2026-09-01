// Chrome extension "leave a review" nudge: shared constants, signed per-recipient
// links, and body personalization for the drip sequence.
//
// The sequence step bodies carry {{REVIEW_URL}} and {{REVIEW_CONFIRM_URL}}
// placeholders; the email-marketing cron replaces them with per-recipient signed
// URLs at send time (see personalizeReviewBody). The links are stateless: an HMAC
// of the normalized recipient proves the click came from an email we sent, so no
// per-send token row is needed, exactly like the one-click unsubscribe links.
//
// Data model + drip live in supabase/migrations/20260901_extension_review_nudge.sql.

import crypto from "node:crypto";
import { normalizeEmail } from "@/lib/email-unsubscribe";

/** Contact tag that auto-enrolls an address into the review-nudge sequence. */
export const EXT_REVIEW_TAG = "ext-review-nudge";

/** email_subscribers.source stamped on addresses captured from an install. */
export const EXT_REVIEW_SOURCE = "extension-install";

/**
 * Reward for completing the on-site feedback survey: percent off the FIRST
 * month of Pro (LS duration "once"), minted per-user + single-use. This is tied
 * to the feedback survey ONLY, never to leaving a review: an incentivized Web
 * Store review would violate Chrome Web Store + FTC policy.
 */
export const EXT_REVIEW_DISCOUNT_PERCENT = 99;

/** How long a minted feedback-reward code stays valid before expiring. */
export const EXT_REVIEW_DISCOUNT_TTL_DAYS = 30;

/**
 * Hardcoded sequence id from the seed migration. Used by the cron to recognize
 * the review-ask sequence (exempt it from stop-on-subscribe) without a name/tag
 * round-trip.
 */
export const EXT_REVIEW_SEQUENCE_ID = "1a5e0005-0000-4000-a000-000000000005";

/**
 * The Chrome Web Store reviews tab for Influencer Butler. Opening it lands the
 * user on the review UI where they can rate and write. Kept as one constant so
 * the redirect and any on-site link can never drift.
 */
export const CHROME_REVIEW_URL =
  "https://chromewebstore.google.com/detail/influencer-butler/cnkfballfjhdijogkjjhdfmnkijcjgbc/reviews";

function siteUrl(): string {
  const raw =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  return raw.replace(/\/$/, "");
}

// Same secret fallbacks as email-unsubscribe: a dedicated secret is preferred,
// but any stable server secret works, so this needs no new Vercel env var. The
// value only needs to be stable and secret.
function secret(): string {
  const s =
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) console.error("extension-review: no signing secret configured");
  return s;
}

/**
 * HMAC token proving a review link was issued for this address. The "extreview:"
 * context keeps these tokens distinct from unsubscribe tokens for the same email
 * so one can never be replayed as the other. Empty string if no secret.
 */
export function reviewToken(email: string): string {
  const key = secret();
  if (!key) return "";
  return crypto
    .createHmac("sha256", key)
    .update(`extreview:${normalizeEmail(email)}`)
    .digest("base64url");
}

/** Constant-time verification of a token from a review link. */
export function verifyReviewToken(email: string, token: string): boolean {
  const expected = reviewToken(email);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Tracked redirect that stamps review_clicked_at, then 302s to the store. */
export function reviewClickUrl(email: string): string {
  const e = encodeURIComponent(normalizeEmail(email));
  const t = encodeURIComponent(reviewToken(email));
  return `${siteUrl()}/api/extension/review/click?e=${e}&t=${t}`;
}

/** Self-report link: stamps review_left_at, cancels the drip, shows a thank-you. */
export function reviewConfirmUrl(email: string): string {
  const e = encodeURIComponent(normalizeEmail(email));
  const t = encodeURIComponent(reviewToken(email));
  return `${siteUrl()}/api/extension/review/confirm?e=${e}&t=${t}`;
}

/** On-site feedback survey (earns the discount). Token-gated to this address. */
export function feedbackSurveyUrl(email: string): string {
  const e = encodeURIComponent(normalizeEmail(email));
  const t = encodeURIComponent(reviewToken(email));
  return `${siteUrl()}/extension-feedback?e=${e}&t=${t}`;
}

/**
 * Replaces the review/feedback placeholders in a sequence step body with
 * per-recipient signed URLs:
 *   {{REVIEW_URL}}          tracked redirect to the Web Store review page
 *   {{REVIEW_CONFIRM_URL}}  "already reviewed" self-report (stops the drip)
 *   {{FEEDBACK_URL}}        on-site feedback survey that earns the discount
 * A no-op on bodies without any placeholder, so it is safe to run over every
 * sequence send. Kept pure for unit testing.
 */
export function personalizeReviewBody(body: string, email: string): string {
  if (!body.includes("{{")) return body;
  return body
    .split("{{REVIEW_URL}}")
    .join(reviewClickUrl(email))
    .split("{{REVIEW_CONFIRM_URL}}")
    .join(reviewConfirmUrl(email))
    .split("{{FEEDBACK_URL}}")
    .join(feedbackSurveyUrl(email));
}
