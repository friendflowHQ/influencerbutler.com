/**
 * POST /api/admin/events/ai-draft
 * Body: { title, startsAt (ISO), endsAt (ISO), timezone?, notes? }
 * Drafts the event description + invite/replay email copy with the text LLM
 * (Groq first, OpenAI fallback) for the admin to review. Saves nothing: the
 * response populates the create form. Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { draftEventContent, isDraftConfigured } from "@/lib/event-ai-draft";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const title = typeof b.title === "string" ? b.title.trim().slice(0, 300) : "";
  if (!title) return NextResponse.json({ error: "A title is required to draft." }, { status: 400 });

  const startMs = Date.parse(String(b.startsAt ?? ""));
  const endMs = Date.parse(String(b.endsAt ?? ""));
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return NextResponse.json({ error: "Valid start and end times are required." }, { status: 400 });
  }
  const timezone = typeof b.timezone === "string" && b.timezone.trim() ? b.timezone.trim().slice(0, 64) : "America/Denver";
  const notes = typeof b.notes === "string" ? b.notes.trim().slice(0, 2000) : null;

  if (!isDraftConfigured()) {
    return NextResponse.json({ error: "No AI provider configured (set GROQ_API_KEY or OPENAI_API_KEY)." }, { status: 503 });
  }

  const result = await draftEventContent({ title, startMs, endMs, timezone, notes });
  if (!result.ok) {
    return NextResponse.json(
      { error: `Could not draft this one (${result.reason}). Try again.` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, draft: result.draft });
}
