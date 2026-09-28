/**
 * GET /api/admin/ai-sessions?limit=50
 * Lists recent Butler AI concierge sessions (newest first) with their AI summary
 * for the owner to review. Super-admin only (ADMIN_EMAILS).
 *
 * Dependencies: @/lib/admin, @/lib/scheduling-server.
 */
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { getAdmin } from "@/lib/scheduling-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const url = new URL(request.url);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const { data, error } = await admin
    .from("ai_concierge_sessions")
    .select("id,user_email,mode,started_at,ended_at,summary")
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[admin/ai-sessions] query", error.message);
    return NextResponse.json({ error: "Could not load sessions." }, { status: 500 });
  }

  return NextResponse.json({ sessions: data ?? [] });
}
