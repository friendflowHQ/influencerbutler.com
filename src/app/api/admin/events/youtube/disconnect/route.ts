/**
 * POST /api/admin/events/youtube/disconnect
 * Clears the dedicated YouTube-account connection (youtube_refresh_token /
 * youtube_account_email). After this, YouTube uploads fall back to the
 * calls/scheduling Google account until a YouTube account is reconnected. Gated
 * by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin } from "@/lib/scheduling-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { error } = await admin
    .from("call_config")
    .update({ youtube_refresh_token: null, youtube_account_email: null, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) { console.error("[events/youtube/disconnect]", error.message); return NextResponse.json({ error: "Update failed" }, { status: 500 }); }

  await logAdminAction({ actor, action: "events.youtube.disconnect", targetType: "call_config", targetId: "1", details: {} });
  return NextResponse.json({ ok: true });
}
