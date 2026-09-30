/**
 * GET /api/admin/scheduling/list?scope=upcoming|past|all
 * GET /api/admin/scheduling/list?from=<ISO>&to=<ISO>
 * Bookings for the owner console. Gated by scheduling.view. The from/to form
 * (used by the week/month calendar views) returns every booking starting in
 * that exact window, uncapped by the 200-row scope limit below, so navigating
 * the calendar to an older or farther-out period isn't silently truncated.
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

  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const nowIso = new Date().toISOString();
  let q = admin
    .from("call_bookings")
    .select("id,user_email,user_name,call_type,starts_at,ends_at,user_ends_at,user_timezone,status,topic,join_url,meeting_provider,host_notes,created_at,recording_status");

  let limit = 200;
  if (from && to) {
    // Calendar grid request: an exact, bounded window, so raise the cap well
    // past anything a single week or month could plausibly hold.
    q = q.gte("starts_at", from).lt("starts_at", to).order("starts_at", { ascending: true });
    limit = 1000;
  } else {
    const scope = params.get("scope") || "upcoming";
    // Split upcoming/past by the call's END time, not its start, so a call that has
    // begun but is not over yet stays under "upcoming". Rows with a null ends_at
    // (legacy inserts) are treated as not-yet-past and kept in "upcoming".
    // Terminal statuses drop out of "upcoming" regardless of time: a call marked
    // done, no-show, or cancelled is resolved, so it should not linger just because
    // its scheduled time is still in the future (it stays visible under All/Past).
    if (scope === "upcoming") q = q.or(`ends_at.gte.${nowIso},ends_at.is.null`).not("status", "in", "(cancelled,completed,no_show)").order("starts_at", { ascending: true });
    else if (scope === "past") q = q.lt("ends_at", nowIso).order("starts_at", { ascending: false });
    else q = q.order("starts_at", { ascending: false });
  }

  const { data, error } = await q.limit(limit);
  if (error) {
    // Surface the underlying Postgres error to the (admin-gated) caller. This is
    // how prod schema drift shows up here: a missing column makes the whole list
    // fail, and a generic message hides which column, so name it explicitly.
    console.error("scheduling/list query failed", error);
    return NextResponse.json({ error: "Query failed", detail: error.message, code: error.code }, { status: 500 });
  }
  return NextResponse.json({ bookings: data ?? [] });
}
