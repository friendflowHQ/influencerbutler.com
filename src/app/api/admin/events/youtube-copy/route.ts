/**
 * POST /api/admin/events/youtube-copy
 * Body: { id }
 * Drafts YouTube upload copy (title, SEO description with links + hashtags, and
 * a tags string) for an event, for the admin to paste into YouTube Studio when
 * uploading a recording by hand. Uses the AI recap when the call was recorded.
 * Saves nothing. Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, getEvent } from "@/lib/events";
import { draftYouTubeCopy } from "@/lib/event-youtube-copy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_RE = /^[0-9a-f-]{36}$/i;

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: unknown };
  try {
    body = (await request.json()) as { id?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { copy, note } = await draftYouTubeCopy(event);
  return NextResponse.json({ ok: true, copy, note });
}
