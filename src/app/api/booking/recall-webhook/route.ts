/**
 * POST /api/booking/recall-webhook
 * Recall.ai (Svix-signed) callback for a recording bot. On a recording/
 * transcript completion event we fetch the transcript + recording URL, run the
 * AI-notes summarizer, and store everything on the matching call_bookings row
 * (matched by recall_bot_id, echoed back in the bot metadata). In-call events
 * flip the row to 'recording'; a fatal event flips it to 'failed'. If the
 * transcript is not ready yet the row is left 'processing' for the fallback
 * cron to finish.
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { verifyWebhook, fetchTranscriptText, getBot, recordingUrlOf } from "@/lib/recall";
import { summarizeTranscript } from "@/lib/ai-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractBotId(payload: unknown): string | null {
  const p = payload as { data?: { bot_id?: string; bot?: { id?: string }; data?: { bot?: { id?: string } } } };
  return (
    p?.data?.bot_id ||
    p?.data?.bot?.id ||
    p?.data?.data?.bot?.id ||
    null
  );
}

export async function POST(request: Request) {
  const raw = await request.text();
  if (!verifyWebhook(raw, request.headers)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const event = String((payload as { event?: string })?.event || "").toLowerCase();
  const botId = extractBotId(payload);
  if (!botId) return NextResponse.json({ ok: true, ignored: "no bot id" });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "server misconfigured" }, { status: 500 });

  // Find the booking this bot belongs to.
  const { data: booking } = await admin
    .from("call_bookings")
    .select("id, call_type, topic, recording_status")
    .eq("recall_bot_id", botId)
    .maybeSingle();
  if (!booking) return NextResponse.json({ ok: true, ignored: "no booking for bot" });

  // Fatal / error → mark failed.
  if (/fatal|error/.test(event)) {
    await admin.from("call_bookings").update({ recording_status: "failed" }).eq("id", booking.id);
    return NextResponse.json({ ok: true, status: "failed" });
  }

  // In-call / joining / recording → mark recording (unless already finalized).
  if (/in_call|joining|recording|call_started|participant/.test(event) && booking.recording_status !== "ready") {
    await admin.from("call_bookings").update({ recording_status: "recording" }).eq("id", booking.id);
    // fall through only if this is also a completion event
  }

  // Completion-ish → try to finalize (fetch transcript + recording + notes).
  const isDone = /done|completed|complete|ended|transcript|analysis/.test(event);
  if (!isDone) return NextResponse.json({ ok: true, status: "noted" });

  const bot = await getBot(botId);
  const recordingUrl = recordingUrlOf(bot);
  const transcript = await fetchTranscriptText(botId);

  if (!transcript) {
    // Recording done but transcript not ready yet; let the cron retry.
    await admin.from("call_bookings").update({
      recording_status: "processing",
      recording_url: recordingUrl,
    }).eq("id", booking.id);
    return NextResponse.json({ ok: true, status: "processing" });
  }

  const notes = await summarizeTranscript(transcript, {
    callType: booking.call_type as string,
    topic: (booking.topic as string) || null,
  });

  await admin.from("call_bookings").update({
    recording_status: "ready",
    recording_url: recordingUrl,
    transcript,
    ai_notes: notes,
    recorded_at: new Date().toISOString(),
  }).eq("id", booking.id);

  return NextResponse.json({ ok: true, status: "ready" });
}
