/**
 * GET /api/cron/process-recordings  (hourly, CRON_SECRET-guarded, ?dry=1 to preview)
 * Fallback finisher for call recordings whose Recall webhook never landed (or
 * whose transcript was not ready when it did). Finds bookings still in a
 * non-terminal recording state whose call has ended, then tries to fetch the
 * transcript + recording URL and generate AI notes. After a grace window past
 * the call end with still no transcript, the row is marked 'failed'.
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { fetchTranscriptText, getBot, recordingUrlOf } from "@/lib/recall";
import { applyTranscriptResult } from "@/lib/call-recording-finalize";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// How long after a call ends we keep retrying before giving up on the transcript.
const GRACE_MS = 6 * 3600_000;
const BATCH = 20;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error("[process-recordings] CRON_SECRET not set"); return false; }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

type Row = {
  id: string; call_type: string; topic: string | null;
  recall_bot_id: string | null; recording_status: string; ends_at: string;
  user_email: string | null; tickets_filed_at: string | null;
};

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const { data, error } = await admin
    .from("call_bookings")
    .select("id, call_type, topic, recall_bot_id, recording_status, ends_at, user_email, tickets_filed_at")
    .in("recording_status", ["scheduled", "recording", "processing"])
    .not("recall_bot_id", "is", null)
    .lt("ends_at", nowIso)
    .order("ends_at", { ascending: true })
    .limit(BATCH);

  if (error) { console.error("[process-recordings] query", error.message); return NextResponse.json({ error: "query failed" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];
  if (dry) return NextResponse.json({ ok: true, dry: true, candidates: rows.map((r) => ({ id: r.id, status: r.recording_status, ends_at: r.ends_at })) });

  const results: { id: string; outcome: string }[] = [];
  for (const r of rows) {
    if (!r.recall_bot_id) continue;
    try {
      const transcript = await fetchTranscriptText(r.recall_bot_id);
      if (transcript) {
        const bot = await getBot(r.recall_bot_id);
        const recordingUrl = recordingUrlOf(bot);
        await applyTranscriptResult(
          admin,
          { id: r.id, call_type: r.call_type, topic: r.topic, user_email: r.user_email, tickets_filed_at: r.tickets_filed_at },
          { transcript, recordingUrl },
        );
        results.push({ id: r.id, outcome: "ready" });
        continue;
      }
      // No transcript yet. Give up after the grace window; else keep processing.
      const endedMs = Date.parse(r.ends_at);
      if (Number.isFinite(endedMs) && nowMs - endedMs > GRACE_MS) {
        await admin.from("call_bookings").update({ recording_status: "failed" }).eq("id", r.id);
        results.push({ id: r.id, outcome: "failed" });
      } else {
        if (r.recording_status !== "processing") {
          await admin.from("call_bookings").update({ recording_status: "processing" }).eq("id", r.id);
        }
        results.push({ id: r.id, outcome: "waiting" });
      }
    } catch (e) {
      console.error("[process-recordings] row", r.id, e);
      results.push({ id: r.id, outcome: "error" });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
