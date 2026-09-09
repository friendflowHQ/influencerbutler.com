/**
 * GET /api/dashboard/event-banner
 * The active in-dashboard event banner for the signed-in user (or null). Feeds
 * the EventBanner component. Cookie-authenticated: only signed-in dashboard
 * users see it, matching the other /api/dashboard/* eligibility checks.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAdmin, activeBanners } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ banner: null });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ banner: null });

  try {
    const banners = await activeBanners(admin, "web");
    const b = banners[0];
    if (!b) return NextResponse.json({ banner: null });
    return NextResponse.json({
      banner: { id: b.id, text: b.text, ctaLabel: b.ctaLabel, ctaUrl: b.ctaUrl },
    });
  } catch (e) {
    console.error("[event-banner] failed", e);
    return NextResponse.json({ banner: null });
  }
}
