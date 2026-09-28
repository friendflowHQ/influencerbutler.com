import { NextResponse } from "next/server";
import { getPublicProofNumbers } from "@/lib/proof-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public feed for the marketing-site "proof of numbers" counter. Returns
 * aggregate totals only (deals posted, products scanned, campaigns accepted),
 * each a genuine cumulative count plus its configured baseline offset. No
 * per-user data is ever exposed here. Returns { enabled: false } when the
 * feature is off, so the homepage keeps its static fallback numbers.
 */
export async function GET() {
  const { enabled, metrics } = await getPublicProofNumbers();
  const res = NextResponse.json({ enabled, metrics });
  // Short CDN cache so a burst of page loads does not hammer the DB; still
  // fresh enough that the counter visibly ticks up over a session.
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return res;
}
