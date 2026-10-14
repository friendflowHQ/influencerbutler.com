/**
 * POST /api/admin/events/upload-image
 * JSON body: { id, filename, contentType, data } where data is base64 image
 * bytes (no data: prefix). Stores a user-provided image as the event's banner
 * (replacing any AI-generated cover), in the same Supabase Storage bucket and
 * image_url convention as generateEventImage. Gated by events.manage;
 * audit-logged.
 *
 * JSON (not multipart) because the central CSRF guard requires
 * application/json bodies on every /api/admin/* mutation (see
 * src/lib/csrf-guard.ts) — a multipart body is rejected before this handler
 * ever runs.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "event-images";
const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; contentType?: string; data?: string };
  try {
    body = (await request.json()) as { id?: string; contentType?: string; data?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  const contentType = (body.contentType || "").trim().toLowerCase();
  const data = body.data || "";
  if (!id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  if (!data) return NextResponse.json({ error: "Missing image data" }, { status: 400 });

  const ext = EXT_BY_TYPE[contentType];
  if (!ext) {
    return NextResponse.json({ error: "Image must be PNG, JPEG, WEBP, or GIF." }, { status: 400 });
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(Buffer.from(data, "base64"));
  } catch {
    return NextResponse.json({ error: "Could not decode the image data." }, { status: 400 });
  }
  if (bytes.length === 0) {
    return NextResponse.json({ error: "Missing image data" }, { status: 400 });
  }
  if (bytes.length > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 8MB)." }, { status: 400 });
  }

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const path = `events/${id}.${ext}`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
  });
  if (uploadError) {
    console.error("[admin/events/upload-image] storage upload failed", uploadError.message);
    return NextResponse.json({ error: "Could not upload the image." }, { status: 500 });
  }

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    return NextResponse.json({ error: "Could not resolve the image URL." }, { status: 500 });
  }
  // Cache-bust so a re-upload (same path, upsert) shows the new image.
  const imageUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await admin.from("events").update({ image_url: imageUrl }).eq("id", id);
  if (dbError) {
    console.error("[admin/events/upload-image] update", dbError.message);
    return NextResponse.json({ error: "Could not save the image." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "event.image.upload",
    targetType: "event",
    targetId: id,
    details: { title: event.title, contentType },
  });

  return NextResponse.json({ ok: true, imageUrl });
}
