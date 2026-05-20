import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  readPromoTier,
  writeAffiliateSourceCookieIfMissing,
  writePromoCookies,
} from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TouchBody = {
  /** First-touch affiliate code from a ?code= URL param. Persisted as ib_aff_src cookie. */
  affiliateSource?: string;
};

/**
 * Called from the pricing page + dashboard subscription page on mount to
 * persist the visitor / promo cookies, and (optionally) record the first-touch
 * affiliate code so the affiliate still gets aff_ref credit at checkout even
 * if the user later edits the promo input. RSCs can't mutate cookies during
 * render in Next 16, so this endpoint persists what the page rendered.
 *
 * Body is optional — a bare POST still works (legacy callers).
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const tier = readPromoTier(cookieStore);

  let affiliateSource: string | null = null;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as TouchBody | null;
      if (body && typeof body.affiliateSource === "string" && body.affiliateSource.trim().length > 0) {
        affiliateSource = body.affiliateSource.trim();
      }
    }
  } catch {
    // Body is optional — ignore parse failures.
  }

  const response = NextResponse.json({ tier });
  writePromoCookies(response, cookieStore);
  writeAffiliateSourceCookieIfMissing(response, cookieStore, affiliateSource);
  return response;
}
