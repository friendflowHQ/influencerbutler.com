import { NextResponse } from "next/server";
import { getPublicTestimonials } from "@/lib/testimonials";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public feed for the marketing-site testimonials section. Returns approved,
 * consented reviews (featured first, then newest), shaped to non-identifying
 * fields (first name + role, never email). Empty when the feature is off or
 * nothing is approved yet, so the homepage keeps its static fallback cards.
 */
export async function GET() {
  const { enabled, testimonials } = await getPublicTestimonials();
  const res = NextResponse.json({ enabled, testimonials });
  // Short CDN cache: approved reviews appear within ~1 min (the "real-time" push)
  // without hammering the DB on every homepage load.
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return res;
}
