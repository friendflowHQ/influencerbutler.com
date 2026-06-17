import { NextResponse } from "next/server";
import { getPublicRecentActivity } from "@/lib/recent-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public feed for the marketing-site recent-activity widget. Returns the latest
 * non-hidden, non-bot trial clicks + purchases within the admin-configured
 * window, shaped to non-identifying fields only (no IP, no full name, no email).
 * Returns an empty list (so the widget stays hidden) when the feature is off or
 * nothing is recent.
 */
export async function GET() {
  const { enabled, events } = await getPublicRecentActivity();
  const res = NextResponse.json({ enabled, events });
  // Short CDN cache so a burst of page loads doesn't hammer the DB; still fresh.
  res.headers.set("Cache-Control", "public, s-maxage=30, stale-while-revalidate=60");
  return res;
}
