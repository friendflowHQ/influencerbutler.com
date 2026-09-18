/**
 * POST /api/admin/events/recap  { id }
 * Regenerates the AI recap for an event from its stored transcript and saves it
 * to events.ai_notes, so a recap that failed at finalize time (e.g. a
 * decommissioned model) can be produced on demand. Does NOT email highlights;
 * that stays with the finalize/recap flow. Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin } from "@/lib/events";
import { summarizeTranscript, isAiNotesConfigured } from "@/lib/ai-notes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
// (deploy retrigger)

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = ((raw as { id?: string })?.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  if (!isAiNotesConfigured()) {
    return NextResponse.json({ error: "No AI provider configured (GROQ_API_KEY / OPENAI_API_KEY)." }, { status: 503 });
  }

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const { data: ev, error } = await admin
    .from("events")
    .select("id,title,transcript")
    .eq("id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  if (!ev) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const transcript = typeof ev.transcript === "string" ? ev.transcript : "";
  if (!transcript.trim()) {
    return NextResponse.json({ error: "No transcript yet, nothing to summarize." }, { status: 400 });
  }

  const notes = await summarizeTranscript(transcript, {
    callType: "Live group event",
    topic: typeof ev.title === "string" ? ev.title : null,
  });
  if (!notes) {
    return NextResponse.json({ error: "The AI provider did not return a recap. Try again." }, { status: 502 });
  }

  const { error: upErr } = await admin.from("events").update({ ai_notes: notes }).eq("id", id);
  if (upErr) return NextResponse.json({ error: "Could not save the recap." }, { status: 500 });

  return NextResponse.json({ ok: true, notes });
}
