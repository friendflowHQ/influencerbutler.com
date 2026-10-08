/**
 * Signed "manage my booking" links. Every call email carries one so the
 * customer can reschedule or cancel without logging in (they are often on a
 * phone, or reading the email in a different browser than their dashboard).
 *
 * Stateless, like the unsubscribe links: an HMAC of the booking id proves the
 * link came from an email we sent for that booking, so no token table is needed.
 * The HMAC is domain-separated ("call-manage:") so it can never be replayed as
 * another feature's token. Links stay valid for the life of the booking but only
 * act on a confirmed, upcoming call (enforced by the routes, not the token).
 */
import crypto from "node:crypto";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function siteUrl(): string {
  const raw = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  return raw.replace(/\/$/, "");
}

// A dedicated SCHEDULING_LINK_SECRET is preferred; otherwise fall back to the
// same stable server secrets the unsubscribe links use, so this works in prod
// without a new Vercel env var. Rotating the secret invalidates links already
// emailed (customers can still manage calls from their dashboard).
function secret(): string {
  return (
    process.env.SCHEDULING_LINK_SECRET ||
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  );
}

export function isBookingId(id: string): boolean {
  return UUID_RE.test(id);
}

/** HMAC token for a booking id. Empty string when no signing secret is configured. */
export function manageToken(bookingId: string): string {
  const key = secret();
  if (!key || !isBookingId(bookingId)) return "";
  return crypto.createHmac("sha256", key).update(`call-manage:${bookingId.toLowerCase()}`).digest("base64url");
}

/** Constant-time check of a token from a manage link. */
export function verifyManageToken(bookingId: string, token: string): boolean {
  const expected = manageToken(bookingId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Public manage URL for a booking, or null when it cannot be signed (no secret
 * configured), in which case emails fall back to pointing at the dashboard.
 */
export function manageUrl(bookingId: string): string | null {
  const t = manageToken(bookingId);
  if (!t) return null;
  return `${siteUrl()}/booking/manage/${bookingId.toLowerCase()}?t=${encodeURIComponent(t)}`;
}
