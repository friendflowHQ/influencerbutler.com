/**
 * GET /api/cron/event-reminders  (hourly, CRON_SECRET-guarded, ?dry=1 to preview)
 * Sends 24h + 1h reminder emails to everyone registered for an upcoming event,
 * idempotently (stamps event_registrations.reminded_24h_at / reminded_1h_at).
 * Clones the call-reminders cron pattern.
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/events";
import { sendEventReminder, type EventEmailData } from "@/lib/event-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[event-reminders] CRON_SECRET not set");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  join_url: string | null;
};

type RegRow = {
  id: string;
  event_id: string;
  user_email: string;
  user_name: string | null;
  user_timezone: string | null;
  reminded_24h_at: string | null;
  reminded_1h_at: string | null;
};

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const in24h = new Date(now + 24 * 3600_000).toISOString();
  const in75mMs = now + 75 * 60_000;

  const { data: eventsData, error: evErr } = await admin
    .from("events")
    .select("id,title,description,starts_at,ends_at,timezone,join_url")
    .eq("status", "scheduled")
    .gte("starts_at", nowIso)
    .lte("starts_at", in24h);
  if (evErr) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const events = (eventsData ?? []) as EventRow[];
  if (events.length === 0) return NextResponse.json({ ok: true, dry, events: 0, sent24: 0, sent1: 0 });

  const eventById = new Map(events.map((e) => [e.id, e]));
  const { data: regData, error: regErr } = await admin
    .from("event_registrations")
    .select("id,event_id,user_email,user_name,user_timezone,reminded_24h_at,reminded_1h_at")
    .in(
      "event_id",
      events.map((e) => e.id),
    )
    .is("cancelled_at", null);
  if (regErr) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const regs = (regData ?? []) as RegRow[];
  let sent24 = 0;
  let sent1 = 0;

  for (const r of regs) {
    const ev = eventById.get(r.event_id);
    if (!ev) continue;
    const startMs = Date.parse(ev.starts_at);
    const data: EventEmailData = {
      id: ev.id,
      title: ev.title,
      description: ev.description,
      startMs,
      endMs: Date.parse(ev.ends_at),
      joinUrl: ev.join_url,
      toEmail: r.user_email,
      toName: r.user_name,
      timezone: r.user_timezone || ev.timezone,
    };

    // 1h reminder (within 75 min, not yet sent).
    if (!r.reminded_1h_at && startMs <= in75mMs) {
      if (!dry) {
        await sendEventReminder(data, "1h");
        await admin
          .from("event_registrations")
          .update({ reminded_1h_at: new Date().toISOString() })
          .eq("id", r.id);
      }
      sent1++;
      continue;
    }
    // 24h reminder (within 24h, not yet sent), skip if <75 min (1h covers it).
    if (!r.reminded_24h_at && startMs - now > 75 * 60_000) {
      if (!dry) {
        await sendEventReminder(data, "24h");
        await admin
          .from("event_registrations")
          .update({ reminded_24h_at: new Date().toISOString() })
          .eq("id", r.id);
      }
      sent24++;
    }
  }

  return NextResponse.json({ ok: true, dry, events: events.length, candidates: regs.length, sent24, sent1 });
}
