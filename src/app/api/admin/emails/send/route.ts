/**
 * GET /api/admin/emails/send?id=<uuid>
 *
 * One email send in full detail for the admin drill-down drawer: the
 * email_sends row plus its event timeline from email_send_events (which links
 * were clicked, from what device/IP, in order). Events exist only for sends
 * with a resend_id (suppressed/failed sends never reached Resend).
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const { data: send, error } = await db
    .from("email_sends")
    .select(
      "id, resend_id, broadcast_id, recipient, subject, category, funnel, status, delivered_at, opened_at, clicked_at, bounced_at, complained_at, last_event_at, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("admin emails/send: query failed", error);
    return NextResponse.json({ send: null, events: [], migrationPending: true });
  }
  if (!send) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let events: unknown[] = [];
  let eventsMigrationPending = false;
  if (send.resend_id) {
    const { data: eventRows, error: eventsError } = await db
      .from("email_send_events")
      .select("type, url, ip, user_agent, bounce_type, occurred_at")
      .eq("resend_id", send.resend_id)
      .order("occurred_at", { ascending: true })
      .limit(500);
    if (eventsError) {
      // Events table missing while email_sends exists: still return the send.
      eventsMigrationPending = true;
    } else {
      events = eventRows ?? [];
    }
  }

  return NextResponse.json({ send, events, migrationPending: false, eventsMigrationPending });
}
