/**
 * POST /api/admin/support/reply
 * Body: { id, subject, body, advanceStatus?, attachments?, inlineImages? }
 *
 * Sends a human reply to the customer (attributed author='human-support') and
 * logs it to the ticket thread. Proxies the feedback Worker's
 * /agent/tickets/:id/reply behind the support.respond permission and audits it.
 *
 * Attachments ride along as base64 in the JSON body. `attachments` become
 * downloadable email attachments; `inlineImages` are embedded in the message
 * body (the Worker references them via cid:). Validation/caps live in
 * src/lib/email-attachments.ts (shared with the email-campaigns route).
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { callSupportWorker } from "@/lib/support-worker";
import { intakeAttachments } from "@/lib/email-attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_ID_RE = /^fb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set([
  "sent", "acked", "clarifying", "waiting_on_user", "user_replied",
  "patching", "committed", "released", "fixed", "escalated", "spam", "synced", "archived",
]);

type ReplyBody = {
  id?: string;
  subject?: string;
  body?: string;
  advanceStatus?: string;
  attachments?: unknown;
  inlineImages?: unknown;
};

export async function POST(request: Request) {
  const actor = await requirePermission("support.respond", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: ReplyBody;
  try {
    body = (await request.json()) as ReplyBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = (body.id || "").trim();
  if (!FB_ID_RE.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });

  const subject = (body.subject || "").trim();
  const replyBody = (body.body || "").trim();
  if (!subject) return NextResponse.json({ error: "Subject required" }, { status: 400 });
  if (!replyBody) return NextResponse.json({ error: "Body required" }, { status: 400 });

  const media = intakeAttachments(body);
  if (!media.ok) return NextResponse.json({ error: media.error }, { status: 400 });

  const payload: Record<string, unknown> = {
    subject: subject.slice(0, 200),
    body: replyBody.slice(0, 32000),
    author: "human-support",
  };
  if (typeof body.advanceStatus === "string" && ALLOWED_STATUSES.has(body.advanceStatus)) {
    payload.advanceStatus = body.advanceStatus;
  }
  if (media.attachments.length) payload.attachments = media.attachments;
  if (media.inlineImages.length) payload.inlineImages = media.inlineImages;

  const result = await callSupportWorker<{ resendMessageId?: string | null }>(
    `/agent/tickets/${encodeURIComponent(id)}/reply`,
    { method: "POST", body: payload },
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  await logAdminAction({
    actor,
    action: "support.reply",
    targetType: "support_ticket",
    targetId: id,
    details: {
      subject,
      advanceStatus: payload.advanceStatus ?? null,
      attachments: media.attachments.length,
      inlineImages: media.inlineImages.length,
    },
  });

  return NextResponse.json({ ok: true, resendMessageId: result.data.resendMessageId ?? null });
}
