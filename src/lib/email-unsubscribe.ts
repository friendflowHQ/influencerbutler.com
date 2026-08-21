// One-click email unsubscribe: signed links, the suppression check, and the
// footer that every marketing / funnel email appends.
//
// MARKETING EMAILS ONLY. Transactional mail (magic links, license keys,
// purchase receipts, staff invites, commission statements) must never carry an
// unsubscribe link or consult the suppression list: those are required for a
// paid account to function.
//
// The link is stateless: an HMAC of the (normalized) recipient address proves
// the caller was actually sent an email for it, so we never need a per-send
// token row. See supabase/migrations/20260712_email_suppressions.sql for the
// table this reads and writes.

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

function siteUrl(): string {
  const raw =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  return raw.replace(/\/$/, "");
}

// Server-only secret used to sign unsubscribe tokens. A dedicated
// EMAIL_UNSUBSCRIBE_SECRET is preferred; we fall back to other stable server
// secrets so this works in prod without adding a new Vercel env var. The value
// only needs to be stable and secret, never rotated in lockstep with anything.
function secret(): string {
  const s =
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) {
    // No secret anywhere means links can't be verified. Callers treat an empty
    // token as "no unsubscribe affordance" rather than shipping a forgeable one.
    console.error("email-unsubscribe: no signing secret configured");
  }
  return s;
}

/** Lowercase + trim so tokens and lookups are stable across casing/whitespace. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** HMAC token proving an email was sent to this address. Empty if no secret. */
export function unsubscribeToken(email: string): string {
  const key = secret();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(normalizeEmail(email)).digest("base64url");
}

/** Constant-time verification of a token from an unsubscribe link. */
export function verifyUnsubscribeToken(email: string, token: string): boolean {
  const expected = unsubscribeToken(email);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Public one-click unsubscribe URL for an address. */
export function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(normalizeEmail(email));
  const t = encodeURIComponent(unsubscribeToken(email));
  return `${siteUrl()}/api/email/unsubscribe?e=${e}&t=${t}`;
}

// Business legal name + physical postal address. CAN-SPAM (and equivalents)
// require a valid physical address in every commercial email, so it rides in
// the same footer as the unsubscribe link. Kept in one constant so the text and
// HTML footers can never drift apart.
export const POSTAL_ADDRESS =
  "The Social Media Posse LLC (Influencer Butler), 3556 S 5600 W, West Valley City, UT 84120-2815, United States";

/** Plain-text footer appended to every marketing email body. */
export function unsubscribeFooterText(email: string): string {
  return `\n\n${POSTAL_ADDRESS}\n\nDon't want these emails? Unsubscribe: ${unsubscribeUrl(email)}`;
}

/** HTML footer appended to marketing emails that carry an HTML body. */
export function unsubscribeFooterHtml(email: string): string {
  const url = unsubscribeUrl(email);
  return `<p style="font-size:12px;color:#9ca3af;margin-top:24px;">${POSTAL_ADDRESS}<br /><br />Don't want these emails? <a href="${url}" style="color:#9ca3af;">Unsubscribe</a>.</p>`;
}

/**
 * RFC 8058 headers so Gmail / Apple Mail render a native one-click Unsubscribe
 * button and can POST to the endpoint without the recipient opening the page.
 */
export function unsubscribeHeaders(email: string): Record<string, string> {
  const url = unsubscribeUrl(email);
  return {
    "List-Unsubscribe": `<${url}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/** True when the address has opted out of marketing / funnel email. */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from("email_suppressions")
      .select("email")
      .eq("email", normalizeEmail(email))
      .maybeSingle();
    if (error) {
      // Fail open: a transient lookup error shouldn't stall every funnel send.
      // A genuinely unsubscribed user is protected by the recorded row, which a
      // read error is unlikely to be about.
      console.error("isEmailSuppressed: query failed", error);
      return false;
    }
    return Boolean(data);
  } catch (err) {
    console.error("isEmailSuppressed threw", err);
    return false;
  }
}

/** Records an opt-out. Idempotent. Returns true on success. */
export async function recordSuppression(
  email: string,
  reason: "unsubscribe" | "bounce" | "complaint" | "manual" = "unsubscribe",
): Promise<boolean> {
  try {
    const normalized = normalizeEmail(email);
    const db = createAdminClient();
    const { error } = await db
      .from("email_suppressions")
      .upsert({ email: normalized, reason }, { onConflict: "email" });
    if (error) {
      console.error("recordSuppression: upsert failed", error);
      return false;
    }
    // Best-effort: keep the newsletter table consistent if the address is there
    // too, so the two opt-out records don't disagree.
    await db
      .from("email_subscribers")
      .update({ unsubscribed_at: new Date().toISOString() })
      .eq("email", normalized);
    return true;
  } catch (err) {
    console.error("recordSuppression threw", err);
    return false;
  }
}
