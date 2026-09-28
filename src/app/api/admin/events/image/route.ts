/**
 * POST /api/admin/events/image
 * Body: { id: string }
 * Generates (or regenerates) the branded cover image for an event: an AI
 * backdrop in the blog hero style with the title, date, and time overlaid,
 * stored in Supabase Storage. Patches events.image_url and returns the URL.
 * Gated by events.manage; audit-logged. Runs the slow gpt-image-1 call, so it
 * is a separate step from create/update (kept fast) and is auto-invoked by the
 * admin UI right after saving.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent } from "@/lib/events";
import { generateEventImage } from "@/lib/event-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
  if (!id) return NextResponse.json({ error: "Missing event id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const imageUrl = await generateEventImage(
    {
      id: event.id,
      title: event.title,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      timezone: event.timezone,
    },
    admin,
  );
  if (!imageUrl) {
    return NextResponse.json({ error: "Could not generate the image." }, { status: 502 });
  }

  const { error } = await admin.from("events").update({ image_url: imageUrl }).eq("id", id);
  if (error) {
    console.error("[admin/events/image] update", error.message);
    return NextResponse.json({ error: "Could not save the image." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "event.image",
    targetType: "event",
    targetId: id,
    details: { title: event.title },
  });

  return NextResponse.json({ ok: true, imageUrl });
}
