/**
 * POST /api/admin/events/send-replay
 * Body: { id, replayUrl?, subject?, body?, force? }
 *
 * Sends the replay follow-up to every active registrant of an event, on demand,
 * so the owner can send it the moment the recording is up rather than waiting for
 * the hourly replay cron. Uses the event's stored replay copy (replay_subject /
 * replay_body, with a {{REPLAY_URL}} placeholder) unless overridden here, and the
 * event's youtube_url as the replay link unless a replayUrl is passed. Stamps
 * replay_emailed_at so the cron never double-sends; refuses a second send unless
 * force is set. Gated by events.manage; audit-logged. Mirrors the loop in
 * src/lib/event-email-lifecycle.ts sendEventReplays.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { getAdmin, getEvent, activeRegistrations } from "@/lib/events";
import { sendEventReplay, type EventEmailData } from "@/lib/event-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID_RE = /^[0-9a-f-]{36}$/i;

type Body = {
  id?: string;
  replayUrl?: string;
  subject?: string;
  body?: string;
  force?: boolean;
};

export async function POST(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!id || !UUID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const event = await getEvent(admin, id);
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const replayUrl = (body.replayUrl || "").trim() || event.youtubeUrl || "";
  if (!replayUrl) {
    return NextResponse.json(
      { error: "No replay link yet. Upload the recording to YouTube first, or pass a replayUrl." },
      { status: 400 },
    );
  }

  if (event.replayEmailedAt && !body.force) {
    return NextResponse.json(
      { error: `Replay was already sent ${new Date(event.replayEmailedAt).toLocaleString()}. Re-send with force to send again.` },
      { status: 409 },
    );
  }

  const subject = typeof body.subject === "string" ? body.subject : event.replaySubject;
  const copyBody = typeof body.body === "string" ? body.body : event.replayBody;

  const regs = await activeRegistrations(admin, id);
  const endMs = Date.parse(event.endsAt);
  const startMs = Date.parse(event.startsAt);

  let sent = 0;
  for (const r of regs) {
    const emailData: EventEmailData = {
      id: event.id,
      title: event.title,
      description: event.description,
      startMs,
      endMs,
      joinUrl: event.joinUrl,
      toEmail: r.userEmail,
      toName: r.userName,
      timezone: r.userTimezone || event.timezone,
      imageUrl: event.imageUrl,
    };
    const ok = await sendEventReplay(emailData, replayUrl, { subject, body: copyBody });
    if (ok) sent += 1;
  }

  // Stamp so the hourly replay cron does not also send it. If the link sent is a
  // YouTube link that differs from the stored one, correct the event's youtube_url
  // too, so the card, the public event page, and any automation point at the same
  // video we just emailed (a manual upload, or a fix to a wrong stored link).
  const update: Record<string, unknown> = { replay_emailed_at: new Date().toISOString() };
  if (/youtu\.?be/i.test(replayUrl) && replayUrl !== event.youtubeUrl) {
    update.youtube_url = replayUrl;
    update.youtube_status = "uploaded";
  }
  await admin.from("events").update(update).eq("id", id);

  await logAdminAction({
    actor,
    action: "event.send_replay",
    targetType: "event",
    targetId: id,
    details: { sent, total: regs.length, replayUrl, forced: !!body.force },
  });

  return NextResponse.json({ ok: true, sent, total: regs.length, replayUrl });
}
