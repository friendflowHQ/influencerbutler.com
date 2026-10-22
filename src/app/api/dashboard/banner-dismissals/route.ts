/**
 * GET  /api/dashboard/banner-dismissals?key=<key>
 *   -> { dismissed: boolean, persisted: boolean }
 * POST /api/dashboard/banner-dismissals
 *   { key: string } -> { ok: boolean, persisted: boolean }
 *
 * Generic per-user dashboard banner dismissal, stored in
 * profiles.dashboard_dismissals (JSONB, migration 20261022). While that
 * column is missing in prod the route reports persisted: false and the
 * client just keeps the dismissal in memory for that page view, so nothing
 * breaks on schema lag.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readBannerDismissals, writeBannerDismissal } from "@/lib/banner-dismissals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key");
  const userId = await currentUserId();
  if (!userId || !key) return NextResponse.json({ dismissed: false, persisted: false });

  const admin = createAdminClient();
  const { dismissals, persisted } = await readBannerDismissals(admin, userId);
  return NextResponse.json({ dismissed: Boolean(dismissals[key]), persisted });
}

export async function POST(request: Request) {
  const userId = await currentUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { key?: string } = {};
  try {
    body = (await request.json()) as { key?: string };
  } catch {
    // fall through to bad-request below
  }
  if (!body.key) return NextResponse.json({ error: "Missing key" }, { status: 400 });

  const admin = createAdminClient();
  const result = await writeBannerDismissal(admin, userId, body.key);
  return NextResponse.json(result);
}
