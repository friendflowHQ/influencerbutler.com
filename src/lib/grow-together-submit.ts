// Signed "submit your chapter" links for Grow Together Creator Bundle contributors.
//
// A contributor's onboarding email carries a {{BUNDLE_SUBMIT_URL}} placeholder; the
// email-marketing cron replaces it at send time with a per-recipient signed URL
// (see personalizeBundleSubmitBody), exactly like the self-select path links in
// email-path-select.ts. The link is stateless: an HMAC of the normalized recipient
// proves the link came from an email we sent, so no per-send token row is needed,
// and no login is required to reach the submission form. Same trust model as the
// one-click unsubscribe and self-select links.
//
// The submit page (/grow-together/submit) and POST /api/grow-together/submit verify
// the token before loading or writing a contributor's chapter.

import crypto from "node:crypto";
import { normalizeEmail } from "@/lib/email-unsubscribe";

function siteUrl(): string {
  const raw =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  return raw.replace(/\/$/, "");
}

// Same secret fallbacks as email-unsubscribe / email-path-select: a dedicated
// secret is preferred, but any stable server secret works, so this needs no new
// Vercel env var. The value only needs to be stable and secret.
function secret(): string {
  const s =
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) console.error("grow-together-submit: no signing secret configured");
  return s;
}

/**
 * HMAC token proving a submit link was issued for this address. The "bundlesubmit:"
 * context keeps these tokens distinct from unsubscribe, review, and path-select
 * tokens for the same email, so no token can be replayed for a different purpose.
 * Empty string if no secret.
 */
export function bundleSubmitToken(email: string): string {
  const key = secret();
  if (!key) return "";
  return crypto
    .createHmac("sha256", key)
    .update(`bundlesubmit:${normalizeEmail(email)}`)
    .digest("base64url");
}

/** Constant-time verification of a token from a submit link. */
export function verifyBundleSubmitToken(email: string, token: string): boolean {
  const expected = bundleSubmitToken(email);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Signed link to a contributor's chapter submission form (no login required). */
export function bundleSubmitUrl(email: string): string {
  const e = encodeURIComponent(normalizeEmail(email));
  const t = encodeURIComponent(bundleSubmitToken(email));
  return `${siteUrl()}/grow-together/submit?e=${e}&t=${t}`;
}

/**
 * Replaces the {{BUNDLE_SUBMIT_URL}} placeholder in a sequence step body with this
 * recipient's signed submission link. A no-op on bodies without the placeholder, so
 * it is safe to run over every sequence send. Kept pure for unit testing.
 */
export function personalizeBundleSubmitBody(body: string, email: string): string {
  if (!body.includes("{{BUNDLE_SUBMIT_URL}}")) return body;
  return body.split("{{BUNDLE_SUBMIT_URL}}").join(bundleSubmitUrl(email));
}
