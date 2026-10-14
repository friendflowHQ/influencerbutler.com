/**
 * POST /api/admin/events/upload-image/confirm
 * JSON body: { id, path }
 * Second half of the signed-upload flow (see ../route.ts): called once the
 * browser has PUT the file straight to Supabase Storage with the token from
 * the start step. Resolves the object's public URL and patches
 * events.image_url. Gated by events.manage; audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";
import { EVENT_IMAGE_BUCKET } from "@/lib/event-image-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: { id?: string; path?: string };
  try {
    body = (await request.json()) as { id?: string; path?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  const path = (body.path || "").trim();
  if (!id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });
  // The path an admin's own upload step just wrote to is always events/<id>.<ext>;
  // reject anything else rather than trust an arbitrary client-supplied path.
  if (!path || !path.startsWith(`events/${id}.`)) {
    return NextResponse.json({ error: "Invalid image path" }, { status: 400 });
  }

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { data: pub } = admin.storage.from(EVENT_IMAGE_BUCKET).getPublicUrl(path);
  if (!pub?.publicUrl) {
    return NextResponse.json({ error: "Could not resolve the image URL." }, { status: 500 });
  }
  // Cache-bust so a re-upload (same path, upsert) shows the new image.
  const imageUrl = `${pub.publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await admin.from("events").update({ image_url: imageUrl }).eq("id", id);
  if (dbError) {
    console.error("[admin/events/upload-image/confirm] update", dbError.message);
    return NextResponse.json({ error: "Could not save the image." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "event.image.upload",
    targetType: "event",
    targetId: id,
    details: { title: event.title, path },
  });

  return NextResponse.json({ ok: true, imageUrl });
}
