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
    .select("id,user_email,user_name,call_type,starts_at,ends_at,user_ends_at,user_timezone,status,topic,join_url,meeting_provider,host_notes,created_at,recording_status");

  // Split upcoming/past by the call's END time, not its start, so a call that has
  // begun but is not over yet stays under "upcoming". Rows with a null ends_at
  // (legacy inserts) are treated as not-yet-past and kept in "upcoming".
  if (scope === "upcoming") q = q.or(`ends_at.gte.${nowIso},ends_at.is.null`).neq("status", "cancelled").order("starts_at", { ascending: true });
  else if (scope === "past") q = q.lt("ends_at", nowIso).order("starts_at", { ascending: false });
  else q = q.order("starts_at", { ascending: false });

  const { data, error } = await q.limit(200);
  if (error) {
    // Surface the underlying Postgres error to the (admin-gated) caller. This is
    // how prod schema drift shows up here: a missing column makes the whole list
    // fail, and a generic message hides which column, so name it explicitly.
    console.error("scheduling/list query failed", error);
    return NextResponse.json({ error: "Query failed", detail: error.message, code: error.code }, { status: 500 });
  }
  return NextResponse.json({ bookings: data ?? [] });
}
