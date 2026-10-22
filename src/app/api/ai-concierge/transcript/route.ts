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
import { fileTicketsFromConciergeSession, type ConciergeSessionRow } from "@/lib/concierge-tickets";

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
  if (!admin) {
    console.error("[ai-concierge/transcript] no admin client - session not logged", user.email);
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  // Summarize (best-effort; store the raw transcript regardless).
  const summary = transcript ? await summarizeTranscript(transcript, { callType: `ai-${mode}` }) : null;
  const endedAt = new Date().toISOString();

  // The core save (transcript/summary) must never be at the mercy of the
  // ticket-filing columns below: on a fresh deploy the migration adding
  // tickets_filed_at/filed_ticket_ids may not be applied yet (hand-applied in
  // the Supabase SQL editor, same as the rest of this table), and an UPDATE
  // ... RETURNING that names a column which does not exist fails the WHOLE
  // statement, not just the SELECT. So this stays a plain "id" round trip,
  // deliberately separate from the best-effort ticket-filing step after it.
  let rowId: string | null = null;
  try {
    if (body.sessionId) {
      const { error } = await admin
        .from("ai_concierge_sessions")
        .update({ ended_at: endedAt, transcript, summary })
        .eq("id", body.sessionId)
        .eq("user_id", user.id);
      if (error) console.error("[ai-concierge/transcript] update", error.message);
      else rowId = body.sessionId;
    } else {
      const startedAt = body.startedAt ? new Date(body.startedAt).toISOString() : endedAt;
      const { data, error } = await admin
        .from("ai_concierge_sessions")
        .insert({
          user_id: user.id,
          user_email: user.email ?? null,
          mode,
          started_at: startedAt,
          ended_at: endedAt,
          transcript,
          summary,
        })
        .select("id")
        .maybeSingle();
      if (error) console.error("[ai-concierge/transcript] insert", error.message);
      // Returned so a long-lived text widget can update the same row on later saves.
      rowId = (data as { id?: string } | null)?.id ?? null;
    }
  } catch (err) {
    console.error("[ai-concierge/transcript] threw", err);
  }

  // Best-effort auto-filing, fully decoupled from the save above: any failure
  // here (including the migration not being applied yet) only drops ticket
  // filing for this save, never the transcript itself.
  if (rowId && transcript) {
    try {
      const { data: row, error } = await admin
        .from("ai_concierge_sessions")
        .select("id,mode,user_email,tickets_filed_at")
        .eq("id", rowId)
        .maybeSingle();
      if (error) console.error("[ai-concierge/transcript] ticket lookup", error.message);
      else if (row) await fileTicketsFromConciergeSession(admin, row as ConciergeSessionRow, transcript, summary);
    } catch (err) {
      console.error("[ai-concierge/transcript] ticket filing threw", err);
    }
  }

  return NextResponse.json({ ok: true, ...(rowId ? { id: rowId } : {}) });
}
