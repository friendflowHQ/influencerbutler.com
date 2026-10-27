/**
 * GET /api/cron/call-reminders  (hourly, CRON_SECRET-guarded, ?dry=1 to preview)
 * Sends 24h + 1h reminder emails for upcoming confirmed calls, idempotently
 * (stamps reminded_24h_at / reminded_1h_at).
 */
import { NextResponse } from "next/server";
import { getAdmin, loadConfig } from "@/lib/scheduling-server";
import { sendReminder, type BookingEmailData } from "@/lib/call-emails";
import { CALL_TYPES, type CallTypeKey } from "@/lib/scheduling";
import { createMeetEvent, isGoogleConfigured } from "@/lib/google-meet";
import { verifyBearer } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

type Row = {
  id: string; call_type: string; user_email: string; user_name: string | null;
  starts_at: string; user_ends_at: string; user_timezone: string | null; topic: string | null;
  join_url: string | null; reminded_24h_at: string | null; reminded_1h_at: string | null;
};

function toEmail(r: Row): BookingEmailData {
  return {
    id: r.id, callType: r.call_type as CallTypeKey, userEmail: r.user_email, userName: r.user_name,
    startMs: Date.parse(r.starts_at), userEndMs: Date.parse(r.user_ends_at),
    userTimezone: r.user_timezone, topic: r.topic, joinUrl: r.join_url,
  };
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const now = Date.now();
  const in24h = new Date(now + 24 * 3600_000).toISOString();
  const in75m = new Date(now + 75 * 60_000).toISOString();
  const nowIso = new Date(now).toISOString();

  const { data, error } = await admin
    .from("call_bookings")
    .select("id,call_type,user_email,user_name,starts_at,user_ends_at,user_timezone,topic,join_url,reminded_24h_at,reminded_1h_at")
    .eq("status", "confirmed")
    .gte("starts_at", nowIso)
    .lte("starts_at", in24h);
  if (error) return NextResponse.json({ error: "Query failed" }, { status: 500 });

  const rows = (data ?? []) as Row[];
  let sent24 = 0, sent1 = 0;

  // Both reminder bodies promise "your join link will be emailed shortly" when
  // join_url is still null at send time, but nothing ever generated one after
  // the initial booking attempt (e.g. a transient Google Meet failure with no
  // default-link fallback configured) - the promise was never kept and the
  // customer never got a way to join. Retry the same Meet creation used at
  // booking time here, once per cron pass per booking, so a later reminder
  // (or a future run before the 1h one fires) can carry a real link instead of
  // repeating the same unfulfilled promise.
  let cfg: Awaited<ReturnType<typeof loadConfig>> | null = null;
  for (const r of rows) {
    if (r.join_url) continue;
    if (cfg === null) cfg = await loadConfig(admin);
    let joinUrl: string | null = null;
    let meetingId: string | null = null;
    let provider: string | null = null;
    if (isGoogleConfigured() && cfg.googleRefreshToken) {
      const ct = CALL_TYPES[r.call_type as CallTypeKey];
      const m = await createMeetEvent({
        refreshToken: cfg.googleRefreshToken,
        summary: `${ct?.label ?? "Call"} with Influencer Butler`,
        description: r.topic || undefined,
        startMs: Date.parse(r.starts_at),
        endMs: Date.parse(r.user_ends_at),
        attendeeEmail: r.user_email,
      });
      if (m) { joinUrl = m.joinUrl; meetingId = m.meetingId; provider = "google_meet"; }
    }
    if (!joinUrl && cfg.defaultJoinUrl) { joinUrl = cfg.defaultJoinUrl; provider = "manual"; }
    if (joinUrl) {
      r.join_url = joinUrl;
      if (!dry) {
        await admin.from("call_bookings").update({ join_url: joinUrl, meeting_provider: provider, meeting_id: meetingId }).eq("id", r.id);
      }
    }
  }

  for (const r of rows) {
    const startMs = Date.parse(r.starts_at);
    // 1h reminder (fires when within 75 min and not yet sent).
    if (!r.reminded_1h_at && r.starts_at <= in75m) {
      if (!dry) { await sendReminder(toEmail(r), "1h"); await admin.from("call_bookings").update({ reminded_1h_at: new Date().toISOString() }).eq("id", r.id); }
      sent1++;
      continue;
    }
    // 24h reminder (fires when within 24h and not yet sent), skip if <75m (1h covers it).
    if (!r.reminded_24h_at && startMs - now > 75 * 60_000) {
      if (!dry) { await sendReminder(toEmail(r), "24h"); await admin.from("call_bookings").update({ reminded_24h_at: new Date().toISOString() }).eq("id", r.id); }
      sent24++;
    }
  }

  return NextResponse.json({ ok: true, dry, candidates: rows.length, sent24, sent1 });
}
