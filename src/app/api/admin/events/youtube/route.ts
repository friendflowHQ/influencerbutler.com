/**
 * POST /api/admin/events/youtube  Body: { id }
 * Re-queue an event recording for YouTube upload (sets youtube_status='pending'
 * so the youtube-uploads cron picks it up on its next run). Used for the admin
 * "Upload to YouTube" / "Retry" button: an upload can fail on a very long video,
 * and a recording that finalized before this feature shipped has no queue flag.
 * Gated by events.manage. Never interrupts an in-flight upload.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, getEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string };
  try {
    body = (await request.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!event.recordingUrl) {
    return NextResponse.json({ error: "No recording to upload yet." }, { status: 400 });
  }
  if (event.youtubeStatus === "uploading") {
    return NextResponse.json({ error: "An upload is already in progress." }, { status: 409 });
  }

  const { error } = await admin
    .from("events")
    .update({ youtube_status: "pending", youtube_error: null })
    .eq("id", id);
  if (error) {
    console.error("[admin/events/youtube] requeue", error.message);
    return NextResponse.json({ error: "Could not queue the upload." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, message: "Queued for YouTube upload." });
}
