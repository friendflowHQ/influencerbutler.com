import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readPromoTier, writePromoCookies } from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Called from the pricing page's client island on mount to set/refresh the
// visitor + promo cookies. RSCs can't mutate cookies during render in Next 16,
// so the page renders with the current tier and this endpoint persists it.
export async function POST() {
  const cookieStore = await cookies();
  const tier = readPromoTier(cookieStore);
  const response = NextResponse.json({ tier });
  writePromoCookies(response, cookieStore);
  return response;
}
