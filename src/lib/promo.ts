// Cookie-driven WELCOME promo. First-time visitors get WELCOME30 (30% off the
// first payment), returning visitors get WELCOME15 (15%). Tier is decided
// server-side from the presence of the ib_pv (visitor) cookie — no time
// window, second visit downgrades immediately.
//
// The ib_promo cookie is a non-HttpOnly hint the client island can read for
// analytics / banner copy; the server never trusts it (readPromoTier ignores
// its value and only checks ib_pv presence).
//
// Stacking with affiliate codes is intentionally NOT supported. Callers
// (checkout routes, pricing page) apply the affiliate code if one was supplied
// and skip the WELCOME branch entirely. Surface "one discount per purchase"
// in any UI that exposes both paths.

import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

type CookieReader = {
  get: (name: string) => { value: string } | undefined;
};

export const VISITOR_COOKIE = "ib_pv";
export const PROMO_COOKIE = "ib_promo";

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
 * request — the visitor cookie is only set if missing (so its 2-year TTL
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
