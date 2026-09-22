/**
 * GET /api/app-trial/offer
 *
 * The current trial-end offer, so the desktop app and the app-trial drip quote
 * the same thing. Public and unauthenticated: it returns only what the pricing
 * page would show anyone who arrives with the code, and it carries no personal
 * data in either direction.
 *
 * Why it exists: the desktop topbar used to render a "30% OFF" badge driven by
 * a localStorage flag, with no discount code behind it at all, and the upgrade
 * button opened a plain /pricing page. The app could not tell the truth about
 * an offer it had no way to learn. This is that one source of truth, read from
 * the same env the day14 email uses, so changing the offer does not need an app
 * release.
 *
 * When no code is configured, `code` is null and the app renders no percentage
 * rather than a number we cannot honour. The site's own WELCOME promo still
 * applies on arrival either way.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  const code = process.env.APP_TRIAL_DISCOUNT_CODE || null;
  const parsed = Number.parseInt(process.env.APP_TRIAL_DISCOUNT_PERCENT ?? "", 10);
  const percent = Number.isFinite(parsed) && parsed > 0 && parsed < 100 ? parsed : 0;

  // A code with no sensible percentage would make the app promise an unknown
  // discount, so treat that as no offer at all.
  const offer = code && percent > 0 ? { code, percent } : { code: null, percent: 0 };

  return NextResponse.json(offer, {
    headers: {
      // Short cache: the app asks at most once per launch, and a changed offer
      // should reach installed copies the same day.
      "Cache-Control": "public, max-age=900, s-maxage=900",
    },
  });
}
