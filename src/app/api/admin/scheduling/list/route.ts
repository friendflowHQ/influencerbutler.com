/**
 * GET /api/admin/scheduling/list?scope=upcoming|past|all
 * Bookings for the owner console. Gated by scheduling.view.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin } from "@/lib/scheduling-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("scheduling.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const scope = new URL(request.url).searchParams.get("scope") || "upcoming";
  const nowIso = new Date().toISOString();
  let q = admin
    .from("call_bookings")
    .select("id,user_email,user_name,call_type,starts_at,ends_at,user_ends_at,user_timezone,status,topic,join_url,meeting_provider,host_notes,created_at");

  if (scope === "upcoming") q = q.gte("starts_at", nowIso).neq("status", "cancelled").order("starts_at", { ascending: true });
  else if (scope === "past") q = q.lt("starts_at", nowIso).order("starts_at", { ascending: false });
  else q = q.order("starts_at", { ascending: false });

  const { data, error } = await q.limit(200);
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });
  return NextResponse.json({ bookings: data ?? [] });
}
