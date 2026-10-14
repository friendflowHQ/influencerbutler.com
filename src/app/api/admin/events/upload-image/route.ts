/**
 * POST /api/admin/events/upload-image
 * JSON body: { id, contentType }
 * Issues a short-lived Supabase Storage signed upload URL for the event's
 * banner image, in the same bucket/path convention as generateEventImage.
 * The browser uploads the file bytes directly to Supabase with that token
 * (see confirm/route.ts for the step that then updates image_url), bypassing
 * this Next.js route entirely for the large payload.
 *
 * Why not accept the file here: every /api/admin/* mutation must have an
 * application/json body (see src/lib/csrf-guard.ts), so a file has to travel
 * as base64 JSON, which is ~33% larger than the raw bytes and can exceed the
 * platform's request-body limit for a real photo — exactly the bug this
 * two-step signed-URL flow avoids. Gated by events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin, getEvent } from "@/lib/events";
import { EVENT_IMAGE_BUCKET, EXT_BY_IMAGE_TYPE } from "@/lib/event-image-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; contentType?: string };
  try {
    body = (await request.json()) as { id?: string; contentType?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  const contentType = (body.contentType || "").trim().toLowerCase();
  if (!id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  const ext = EXT_BY_IMAGE_TYPE[contentType];
  if (!ext) {
    return NextResponse.json({ error: "Image must be PNG, JPEG, WEBP, or GIF." }, { status: 400 });
  }

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const path = `events/${id}.${ext}`;
  const { data, error } = await admin.storage.from(EVENT_IMAGE_BUCKET).createSignedUploadUrl(path, {
    upsert: true,
  });
  if (error || !data) {
    console.error("[admin/events/upload-image] createSignedUploadUrl failed", error?.message);
    return NextResponse.json({ error: "Could not start the upload." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, token: data.token, path: data.path });
}
