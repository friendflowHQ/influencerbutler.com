/**
 * GET /api/cron/recall-credit-check  (CRON_SECRET-guarded, ?force=1 to bypass the
 * upcoming-call gate, ?dry=1 to check without emailing)
 *
 * Proactively catches the failure that lost the Prime Day recording: Recall.ai
 * running out of recording credits. When there is an upcoming recordable call
 * (an event or 1:1 booking with a Google Meet room in the next LOOKAHEAD_H hours),
 * it does one live Recall bot-create probe. If Recall refuses for lack of credit
 * (HTTP 402), it emails the owner once (throttled) so the balance can be topped up
 * BEFORE the call, and records the state in app_config so the admin Events page
 * shows a warning. The probe costs nothing when out of credit (no bot is created)
 * and, when credit is fine, creates then immediately removes one throwaway bot.
 *
 * Gated on an upcoming call so we do not probe (or create throwaway bots) around
 * the clock when nothing needs recording.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRecallCredits, isRecallConfigured, isRecordableMeetingUrl } from "@/lib/recall";
import { getRecallCreditStatus, recordRecallCreditCheck } from "@/lib/recall-credit-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How far ahead a call must be for us to bother checking credit now.
const LOOKAHEAD_H = 48;
// A healthy check is trusted for this long before we probe again, so we don't
// create a throwaway bot on every cron tick while credit is fine. When the last
// check was NOT healthy we always re-probe, to notice a top-up quickly.
const FRESH_OK_MS = 6 * 3600_000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("[recall-credit-check] CRON_SECRET not set");
    return false;
  }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type UpcomingRow = { starts_at: string | null; join_url: string | null; topic?: string | null; title?: string | null };

/**
 * The soonest recordable call (event or booking) in the lookahead window, or null.
 * Recordable = scheduled/confirmed, not yet started, with a joinable Meet room.
 */
async function nextRecordableCall(
  admin: ReturnType<typeof createAdminClient>,
): Promise<{ when: string; label: string } | null> {
  const nowIso = new Date().toISOString();
  const untilIso = new Date(Date.now() + LOOKAHEAD_H * 3600_000).toISOString();

  const candidates: { when: string; label: string }[] = [];

  try {
    const { data } = await admin
      .from("events")
      .select("starts_at, join_url, title")
      .eq("status", "scheduled")
      .eq("record_enabled", true)
      .gte("starts_at", nowIso)
      .lte("starts_at", untilIso)
      .order("starts_at", { ascending: true })
      .limit(20);
    for (const r of (data ?? []) as UpcomingRow[]) {
      if (r.starts_at && isRecordableMeetingUrl(r.join_url)) {
        candidates.push({ when: r.starts_at, label: r.title || "event" });
      }
    }
  } catch (e) {
    console.error("[recall-credit-check] events query", e);
  }

  try {
    const { data } = await admin
      .from("call_bookings")
      .select("starts_at, join_url, topic")
      .eq("status", "confirmed")
      .gte("starts_at", nowIso)
      .lte("starts_at", untilIso)
      .order("starts_at", { ascending: true })
      .limit(20);
    for (const r of (data ?? []) as UpcomingRow[]) {
      if (r.starts_at && isRecordableMeetingUrl(r.join_url)) {
        candidates.push({ when: r.starts_at, label: r.topic ? `1:1 call (${r.topic})` : "1:1 call" });
      }
    }
  } catch (e) {
    console.error("[recall-credit-check] bookings query", e);
  }

  candidates.sort((a, b) => Date.parse(a.when) - Date.parse(b.when));
  return candidates[0] ?? null;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const dry = url.searchParams.get("dry") === "1";

  if (!isRecallConfigured()) {
    return NextResponse.json({ skipped: "Recall not configured (RECALL_API_KEY unset)" });
  }

  const admin = createAdminClient();

  const next = await nextRecordableCall(admin);
  if (!next && !force) {
    return NextResponse.json({ skipped: `No recordable call in the next ${LOOKAHEAD_H}h`, checked: false });
  }

  // Throttle the live probe: if the last check was healthy and recent, trust it
  // rather than creating another throwaway bot. Always re-probe when the last
  // result was not healthy, so a top-up is noticed promptly.
  if (!force) {
    const prev = await getRecallCreditStatus(admin);
    if (prev?.ok && Date.now() - Date.parse(prev.checkedAt) < FRESH_OK_MS) {
      return NextResponse.json({ checked: false, skipped: "Recall credit checked recently and healthy", ok: true });
    }
  }

  const status = await checkRecallCredits();

  const upcoming = next
    ? `${next.label} at ${new Date(next.when).toLocaleString("en-US", { timeZone: "America/Denver", timeStyle: "short", dateStyle: "medium" })} MT`
    : undefined;

  if (dry) {
    return NextResponse.json({ checked: true, dry: true, status, upcoming: upcoming ?? null });
  }

  const { alerted } = await recordRecallCreditCheck(status, { admin, upcoming });

  return NextResponse.json({
    checked: true,
    ok: status.ok,
    insufficientCredits: status.insufficientCredits,
    alerted,
    upcoming: upcoming ?? null,
  });
}
