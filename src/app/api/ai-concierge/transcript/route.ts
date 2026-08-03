/**
 * POST /api/ai-concierge/transcript  { sessionId?, mode, startedAt?, transcript }
 * Called when a Butler AI session ends: saves the transcript and an AI summary
 * (reusing the ai-notes summarizer) so the owner can review it in the admin. For
 * voice sessions it updates the row created at session start; for text sessions
 * it inserts a new row. Best-effort - never blocks the user.
 *
 * Dependencies: @/lib/supabase/server, @/lib/scheduling-server, @/lib/ai-notes.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { getAdmin } from "@/lib/scheduling-server";
import { summarizeTranscript } from "@/lib/ai-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TRANSCRIPT = 60_000;

export async function POST(request: Request) {
  // Dual-mode auth so desktop/extension voice sessions (license-key bearer) can
  // save their transcript, not just website-cookie sessions.
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });
  const user = { id: authed.auth.userId, email: authed.auth.email };

  let body: { sessionId?: string; mode?: string; transcript?: string; startedAt?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const transcript = (body.transcript || "").slice(0, MAX_TRANSCRIPT).trim();
  const mode = body.mode === "text" ? "text" : "voice";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ ok: false }, { status: 200 });

  // Summarize (best-effort; store the raw transcript regardless).
  const summary = transcript ? await summarizeTranscript(transcript, { callType: `ai-${mode}` }) : null;
  const endedAt = new Date().toISOString();

  try {
    if (body.sessionId) {
      const { error } = await admin
        .from("ai_concierge_sessions")
        .update({ ended_at: endedAt, transcript, summary })
        .eq("id", body.sessionId)
        .eq("user_id", user.id);
      if (error) console.error("[ai-concierge/transcript] update", error.message);
    } else {
      const startedAt = body.startedAt ? new Date(body.startedAt).toISOString() : endedAt;
      const { error } = await admin.from("ai_concierge_sessions").insert({
        user_id: user.id,
        user_email: user.email ?? null,
        mode,
        started_at: startedAt,
        ended_at: endedAt,
        transcript,
        summary,
      });
      if (error) console.error("[ai-concierge/transcript] insert", error.message);
    }
  } catch (err) {
    console.error("[ai-concierge/transcript] threw", err);
  }

  return NextResponse.json({ ok: true });
}
