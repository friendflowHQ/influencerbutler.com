/**
 * GET /api/cron/call-prep-notice  (CRON_SECRET-guarded, NOT scheduled in vercel.json)
 *
 * One-off: emails every upcoming confirmed call that was booked before the
 * before-you-book checklist existed, asking the customer to finish the guided
 * setup and have their material ready, and saying where to find it. The owner
 * runs it by hand after the release that carries the guided walkthroughs, so the
 * email never points at a walkthrough that is not there yet.
 *
 * Dry by default (lists who would get it). Add ?send=1 to actually send.
 * Idempotent: stamps call_bookings.prep_notice_sent_at, so a second run skips
 * anyone already emailed. Needs supabase/migrations/20261123_call_prep_notice.sql
 * applied first; without the column it refuses to send rather than risk repeats.
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { sendPrepNotice, type BookingEmailData } from "@/lib/call-emails";
import type { CallTypeKey } from "@/lib/scheduling";
import { verifyBearer } from "@/lib/auth-secret";
import { prereqsFor, topicKeysFromText } from "@/lib/call-prerequisites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = {
  id: string; call_type: string; user_email: string; user_name: string | null;
  starts_at: string; user_ends_at: string; user_timezone: string | null; topic: string | null;
  join_url: string | null; prep_notice_sent_at: string | null;
};

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const send = new URL(request.url).searchParams.get("send") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("call_bookings")
    .select("id,call_type,user_email,user_name,starts_at,user_ends_at,user_timezone,topic,join_url,prep_notice_sent_at")
    .eq("status", "confirmed")
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true });
  if (error) {
    const missing = /prep_notice_sent_at/.test(error.message || "");
    return NextResponse.json(
      { error: missing ? "Apply supabase/migrations/20261123_call_prep_notice.sql first." : "Query failed" },
      { status: missing ? 409 : 500 },
    );
  }

  const rows = ((data ?? []) as Row[]).filter((r) => !r.prep_notice_sent_at);
  const results: { id: string; email: string; startsAt: string; action: "would_send" | "sent" | "failed" | "skipped_no_checklist" }[] = [];
  for (const r of rows) {
    const type = r.call_type as CallTypeKey;
    const keys = topicKeysFromText(r.topic);
    // A billing-only call has nothing to prepare, so it gets no notice.
    if (prereqsFor(keys, type).length === 0) {
      results.push({ id: r.id, email: r.user_email, startsAt: r.starts_at, action: "skipped_no_checklist" });
      continue;
    }
    if (!send) {
      results.push({ id: r.id, email: r.user_email, startsAt: r.starts_at, action: "would_send" });
      continue;
    }
    const b: BookingEmailData = {
      id: r.id, callType: type, userEmail: r.user_email, userName: r.user_name,
      startMs: Date.parse(r.starts_at), userEndMs: Date.parse(r.user_ends_at),
      userTimezone: r.user_timezone, topic: r.topic, topics: keys, joinUrl: r.join_url,
    };
    let ok = false;
    try { ok = await sendPrepNotice(b); } catch (e) { console.error("[call-prep-notice] send", e); }
    if (ok) {
      const { error: stampErr } = await admin.from("call_bookings").update({ prep_notice_sent_at: new Date().toISOString() }).eq("id", r.id);
      if (stampErr) console.error("[call-prep-notice] stamp", stampErr.message);
    }
    results.push({ id: r.id, email: r.user_email, startsAt: r.starts_at, action: ok ? "sent" : "failed" });
  }
  return NextResponse.json({ ok: true, dry: !send, candidates: rows.length, results });
}
