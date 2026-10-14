/**
 * POST /api/admin/events/upload-image
 * multipart/form-data: id, file
 * Stores a user-provided image as the event's banner (replacing any
 * AI-generated cover), in the same Supabase Storage bucket and image_url
 * convention as generateEventImage. Gated by events.manage; audit-logged.
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

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const id = String(form.get("id") || "").trim();
  const file = form.get("file");
  if (!id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing image file" }, { status: 400 });

  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json({ error: "Image must be PNG, JPEG, WEBP, or GIF." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (max 8MB)." }, { status: 400 });
  }

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const path = `events/${id}.${ext}`;
  const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) {
    console.error("[admin/events/upload-image] storage upload failed", uploadError.message);
    return NextResponse.json({ error: "Could not upload the image." }, { status: 500 });
  }

  const { data } = admin.storage.from(BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    return NextResponse.json({ error: "Could not resolve the image URL." }, { status: 500 });
  }
  // Cache-bust so a re-upload (same path, upsert) shows the new image.
  const imageUrl = `${data.publicUrl}?v=${Date.now()}`;

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
    details: { title: event.title, contentType: file.type },
  });

  return NextResponse.json({ ok: true, imageUrl });
}
