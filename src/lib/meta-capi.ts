/**
 * Meta (Facebook) Conversions API client. Server-side twin of the browser
 * pixel in src/components/MetaPixel.tsx: both feed the same dataset so Meta
 * can build website custom audiences (and from them, lookalike audiences)
 * even when ad blockers strip the browser pixel.
 *
 * Style mirrors src/lib/ga4.ts: zero dependencies, plain fetch, and every
 * function degrades to a no-op instead of throwing, because analytics must
 * never break a page, a checkout, or a webhook.
 *
 * Env (see .env.example, "Meta (Facebook) Pixel + Conversions API"):
 *   NEXT_PUBLIC_META_PIXEL_ID  - pixel/dataset id, shared with the client
 *                                pixel so the two sides can never drift.
 *   META_CAPI_ACCESS_TOKEN     - server-only Conversions API token.
 *   META_TEST_EVENT_CODE       - optional; routes sends to the Test Events
 *                                tab in Events Manager. Unset in production.
 *
 * Events sent from this codebase (see docs/meta-ads-tracking.md):
 *   Lead                 - /api/trial/start (trial CTA click)
 *   CompleteRegistration - new-account signup (auth callback + magic link)
 *   StartTrial           - LS webhook subscription_created (on_trial)
 *   Purchase             - LS webhook order_created (total > 0)
 */

import { createHash } from "node:crypto";

const GRAPH_ENDPOINT = "https://graph.facebook.com/v21.0";

export type MetaUserData = {
  /** Raw email; hashed here before sending. */
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  /** Stable internal id (Supabase user id); hashed before sending. */
  externalId?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  /** Raw _fbp cookie value. Sent as-is, never hashed. */
  fbp?: string | null;
  /** Raw _fbc cookie value. Sent as-is, never hashed. */
  fbc?: string | null;
};

export type MetaEventInput = {
  eventName: string;
  /**
   * Dedup key. Meta drops repeats of the same event_name + event_id for 48
   * hours, which is also how the client pixel and this server module avoid
   * double-counting a shared event. Use a deterministic id (e.g. the Lemon
   * Squeezy order id) wherever the caller can retry.
   */
  eventId: string;
  eventSourceUrl?: string | null;
  userData: MetaUserData;
  customData?: Record<string, string | number>;
  /** Unix seconds; defaults to now. */
  eventTime?: number;
};

export function isMetaCapiConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_META_PIXEL_ID && process.env.META_CAPI_ACCESS_TOKEN);
}

/**
 * Meta's required normalization for hashed user_data fields: trim, lowercase,
 * then SHA-256 hex. Exported for tests.
 */
export function sha256Normalized(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * Pulls the Meta pixel cookies out of a raw Cookie header. The pixel base
 * code writes _fbp on every page and _fbc whenever the visitor landed with an
 * fbclid (i.e. clicked one of our ads), so no server-side fbclid capture is
 * needed. Either value may be absent (ad blocker, first hit, no ads yet).
 */
export function readMetaCookies(cookieHeader: string | null | undefined): {
  fbp: string | null;
  fbc: string | null;
} {
  const result: { fbp: string | null; fbc: string | null } = { fbp: null, fbc: null };
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name === "_fbp" && !result.fbp) {
      result.fbp = part.slice(eq + 1).trim() || null;
    } else if (name === "_fbc" && !result.fbc) {
      result.fbc = part.slice(eq + 1).trim() || null;
    }
  }
  return result;
}

// True only when the visitor granted advertising consent on the cookie banner
// (public/js/consent.js sets ib_ads_consent=1 on "Accept all"; Reject and GPC
// leave it absent). Server-side Conversions API events gate on this so the
// browser pixel and the server never disagree about consent. The webhook has
// no visitor cookie, so checkout stamps this decision into LS custom_data
// instead (see the checkout routes + meta_consent).
export function hasAdsConsent(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === "ib_ads_consent") {
      return part.slice(eq + 1).trim() === "1";
    }
  }
  return false;
}

function hashedOrOmit(value: string | null | undefined): string[] | undefined {
  const trimmed = value?.trim();
  return trimmed ? [sha256Normalized(trimmed)] : undefined;
}

function buildUserData(input: MetaUserData): Record<string, unknown> {
  // Omit missing keys entirely: a hashed empty string is a real (wrong) match
  // signal to Meta, not a null.
  const userData: Record<string, unknown> = {};
  const em = hashedOrOmit(input.email);
  const fn = hashedOrOmit(input.firstName);
  const ln = hashedOrOmit(input.lastName);
  const externalId = hashedOrOmit(input.externalId);
  if (em) userData.em = em;
  if (fn) userData.fn = fn;
  if (ln) userData.ln = ln;
  if (externalId) userData.external_id = externalId;
  if (input.clientIp) userData.client_ip_address = input.clientIp;
  if (input.userAgent) userData.client_user_agent = input.userAgent;
  if (input.fbp) userData.fbp = input.fbp;
  if (input.fbc) userData.fbc = input.fbc;
  return userData;
}

/**
 * Sends one event to the Conversions API. Never throws; failures are logged
 * with a "meta-capi:" prefix and swallowed. No-ops when env vars are unset,
 * so this is safe to call before the Meta account even exists.
 */
export async function sendMetaEvent(input: MetaEventInput): Promise<void> {
  const pixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;
  const accessToken = process.env.META_CAPI_ACCESS_TOKEN;
  if (!pixelId || !accessToken) return;

  try {
    const event: Record<string, unknown> = {
      event_name: input.eventName,
      event_time: input.eventTime ?? Math.floor(Date.now() / 1000),
      event_id: input.eventId,
      action_source: "website",
      user_data: buildUserData(input.userData),
    };
    if (input.eventSourceUrl) event.event_source_url = input.eventSourceUrl;
    if (input.customData) event.custom_data = input.customData;

    const testEventCode = process.env.META_TEST_EVENT_CODE;
    // Token travels in the POST body, not the query string, so it never lands
    // in request logs.
    const body: Record<string, unknown> = {
      data: [event],
      access_token: accessToken,
      ...(testEventCode ? { test_event_code: testEventCode } : {}),
    };

    const response = await fetch(`${GRAPH_ENDPOINT}/${pixelId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const preview = (await response.text().catch(() => "")).slice(0, 300);
      console.error(
        `meta-capi: ${input.eventName} send failed (${response.status})`,
        preview,
      );
    }
  } catch (error) {
    console.error(`meta-capi: ${input.eventName} send error`, error);
  }
}

// A signup event only counts within this window of account creation. The
// auth callback fires for every login (password confirm + magic link), so
// without an age guard returning users would refire CompleteRegistration on
// each sign-in. This is deliberately tighter than the 7-day window
// isEligibleNewAccount uses for referral stamping: the deterministic
// signup-<userId> event_id already dedups repeats within Meta's 48h window,
// and a rare straggler beyond that is harmless for audience seeding.
const SIGNUP_EVENT_MAX_ACCOUNT_AGE_MS = 60 * 60 * 1000;

/**
 * Fires CompleteRegistration for a genuinely new account. Shared by the auth
 * callback route (password/OAuth code exchange) and /api/analytics/signup
 * (the client-side magic-link verifyOtp path, which never hits the callback).
 * Never throws.
 */
export async function sendSignupMetaEvent(args: {
  userId: string;
  email: string | null;
  createdAt: string | null;
  headers: Headers;
}): Promise<void> {
  try {
    if (!isMetaCapiConfigured()) return;
    if (!args.createdAt) return;
    const createdMs = Date.parse(args.createdAt);
    if (!Number.isFinite(createdMs)) return;
    if (Date.now() - createdMs > SIGNUP_EVENT_MAX_ACCOUNT_AGE_MS) return;

    const forwardedFor = args.headers.get("x-forwarded-for");
    const clientIp =
      forwardedFor?.split(",")[0]?.trim() || args.headers.get("x-real-ip") || null;

    await sendMetaEvent({
      eventName: "CompleteRegistration",
      eventId: `signup-${args.userId}`,
      eventSourceUrl: args.headers.get("referer"),
      userData: {
        email: args.email,
        externalId: args.userId,
        clientIp,
        userAgent: args.headers.get("user-agent"),
        ...readMetaCookies(args.headers.get("cookie")),
      },
    });
  } catch (error) {
    console.error("meta-capi: signup event error", error);
  }
}
