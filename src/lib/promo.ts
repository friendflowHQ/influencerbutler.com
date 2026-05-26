// Cookie-driven WELCOME promo. First-time visitors get WELCOME30 (30% off the
// first payment), returning visitors get WELCOME15 (15%). Tier is decided
// server-side from the presence of the ib_pv (visitor) cookie - no time
// window, second visit downgrades immediately.
//
// The ib_promo cookie is a non-HttpOnly hint the client island can read for
// analytics / banner copy; the server never trusts it (readPromoTier ignores
// its value and only checks ib_pv presence).
//
// Multi-code resolution: WELCOME, URL ?code=, and typed promo are all
// candidates evaluated by src/lib/promo-resolver.ts - the highest-$-saved
// wins the discount slot. Affiliate attribution (aff_ref on the LS checkout)
// is tracked independently of which code's discount won, so an affiliate
// who refers a user via ?code= still gets paid even when WELCOME30 beats
// their personal code on dollar value.
//
// The ib_aff_src cookie is set first-touch when a ?code= arrives on /pricing
// or /dashboard/subscription, and carries the affiliate code across the
// session so the checkout route can include it in resolution.

import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

type CookieReader = {
  get: (name: string) => { value: string } | undefined;
};

export const VISITOR_COOKIE = "ib_pv";
export const PROMO_COOKIE = "ib_promo";
export const AFFILIATE_SOURCE_COOKIE = "ib_aff_src";
export const AFFILIATE_SOURCE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export const WELCOME_FIRST_CODE = "WELCOME30";
export const WELCOME_RETURNING_CODE = "WELCOME15";

export const DISCOUNT_PCT_FIRST = 30;
export const DISCOUNT_PCT_RETURNING = 15;

const VISITOR_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2; // 2 years
const PROMO_MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days

export type PromoTier = "first" | "returning";

export function readPromoTier(cookieStore: CookieReader): PromoTier {
  return cookieStore.get(VISITOR_COOKIE) ? "returning" : "first";
}

export function resolvePromoCode(tier: PromoTier): string {
  return tier === "first" ? WELCOME_FIRST_CODE : WELCOME_RETURNING_CODE;
}

export function discountPctFor(tier: PromoTier): number {
  return tier === "first" ? DISCOUNT_PCT_FIRST : DISCOUNT_PCT_RETURNING;
}

export function applyDiscount(originalCents: number, tier: PromoTier): number {
  const pct = discountPctFor(tier);
  return Math.round(originalCents * (100 - pct)) / 100;
}

/**
 * Sets/refreshes both cookies on a NextResponse. Safe to call on every
 * request - the visitor cookie is only set if missing (so its 2-year TTL
 * doesn't reset constantly), but the promo hint cookie is always refreshed
 * to match the resolved tier.
 */
export function writePromoCookies(
  response: NextResponse,
  cookieStore: CookieReader,
): PromoTier {
  const tier = readPromoTier(cookieStore);

  if (!cookieStore.get(VISITOR_COOKIE)) {
    response.cookies.set({
      name: VISITOR_COOKIE,
      value: randomUUID(),
      httpOnly: false,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: VISITOR_MAX_AGE_SECONDS,
    });
  }

  response.cookies.set({
    name: PROMO_COOKIE,
    value: tier,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: PROMO_MAX_AGE_SECONDS,
  });

  return tier;
}

/**
 * Reads the first-touch affiliate-source code from the ib_aff_src cookie,
 * or null if not set. Always uppercased for consistency with the resolver's
 * dedupe key.
 */
export function readAffiliateSourceCookie(cookieStore: CookieReader): string | null {
  const raw = cookieStore.get(AFFILIATE_SOURCE_COOKIE)?.value;
  if (!raw) return null;
  const normalized = raw.trim().toUpperCase();
  if (normalized.length === 0) return null;
  return normalized;
}

/**
 * Writes the affiliate-source cookie ONLY if not already present (first-touch
 * wins). The 30-day TTL covers the typical "click affiliate link → take a few
 * days to decide → check out" pattern without being so long it shadows a
 * legitimate later affiliate referral.
 *
 * Pass a non-empty code on first touch, or `null` to leave the existing cookie
 * untouched.
 */
export function writeAffiliateSourceCookieIfMissing(
  response: NextResponse,
  cookieStore: CookieReader,
  code: string | null | undefined,
): void {
  if (!code) return;
  const normalized = code.trim().toUpperCase();
  if (normalized.length === 0) return;
  if (cookieStore.get(AFFILIATE_SOURCE_COOKIE)?.value) return;

  response.cookies.set({
    name: AFFILIATE_SOURCE_COOKIE,
    value: normalized,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: AFFILIATE_SOURCE_MAX_AGE_SECONDS,
  });
}
