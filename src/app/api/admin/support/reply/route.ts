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
 * body (the Worker references them via cid:). Everything is capped so the JSON
 * payload stays under Vercel's ~4.5 MB request-body limit (base64 inflates
 * bytes by ~33%, so we cap the raw total at 3 MB).
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { callSupportWorker } from "@/lib/support-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_ID_RE = /^fb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set([
  "sent", "acked", "clarifying", "waiting_on_user", "user_replied",
  "patching", "committed", "released", "fixed", "escalated", "spam", "synced", "archived",
]);

// Keep the JSON payload under Vercel's ~4.5 MB request cap. base64 is ~4/3 the
// raw size, so a 3 MB raw ceiling lands around 4 MB on the wire.
const MAX_ATTACHMENTS = 5;
const MAX_INLINE_IMAGES = 5;
const MAX_ITEM_RAW_BYTES = 3 * 1024 * 1024;
const MAX_TOTAL_RAW_BYTES = 3 * 1024 * 1024;
const MAX_FILENAME_LEN = 200;

// Attachment content types we refuse outright (executables / scripts). Not
// exhaustive security, just a guard against the obvious footguns.
const BLOCKED_CONTENT_TYPES = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-sh",
  "application/x-bat",
  "application/vnd.microsoft.portable-executable",
]);
const BLOCKED_EXTENSIONS = new Set([
  "exe", "bat", "cmd", "com", "msi", "scr", "sh", "ps1", "js", "jar", "vbs",
]);

// Characters that are reserved in filenames or are control chars. Kept as an
// explicit list (built from char codes) so the source stays plain ASCII.
const RESERVED_FILENAME_CHARS = new Set(
  ['<', '>', ':', '"', '|', '?', '*'].concat(
    Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)),
  ),
);

type Attachment = { filename: string; content: string; contentType?: string };

type ReplyBody = {
  id?: string;
  subject?: string;
  body?: string;
  advanceStatus?: string;
  attachments?: unknown;
  inlineImages?: unknown;
};

// Rough raw byte count of a base64 string without allocating a Buffer.
function base64RawBytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (b64.endsWith("==")) padding = 2;
  else if (b64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

function sanitizeFilename(name: string, fallback: string): string {
  const base = (name || "").split(/[\\/]/).pop() || fallback;
  let cleaned = "";
  for (const ch of base) {
    if (!RESERVED_FILENAME_CHARS.has(ch)) cleaned += ch;
  }
  cleaned = cleaned.trim();
  return (cleaned || fallback).slice(0, MAX_FILENAME_LEN);
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

type SanitizeResult =
  | { ok: true; items: Attachment[]; rawBytes: number }
  | { ok: false; error: string };

function sanitizeList(
  raw: unknown,
  opts: { max: number; imageOnly: boolean; label: string },
): SanitizeResult {
  if (raw == null) return { ok: true, items: [], rawBytes: 0 };
  if (!Array.isArray(raw)) return { ok: false, error: `${opts.label} must be an array` };
  if (raw.length > opts.max) {
    return { ok: false, error: `Too many ${opts.label} (max ${opts.max})` };
  }

  const items: Attachment[] = [];
  let rawBytes = 0;
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") {
      return { ok: false, error: `Invalid ${opts.label} entry` };
    }
    const e = entry as Record<string, unknown>;
    const content = typeof e.content === "string" ? e.content.trim() : "";
    if (!content || !/^[A-Za-z0-9+/=]+$/.test(content)) {
      return { ok: false, error: `Invalid ${opts.label} content` };
    }
    const bytes = base64RawBytes(content);
    if (bytes <= 0) return { ok: false, error: `Empty ${opts.label} content` };
    if (bytes > MAX_ITEM_RAW_BYTES) {
      return { ok: false, error: `A file is too large (max ${MAX_ITEM_RAW_BYTES / (1024 * 1024)} MB)` };
    }
    rawBytes += bytes;

    const contentType = typeof e.contentType === "string" ? e.contentType.trim().slice(0, 120) : "";
    const filename = sanitizeFilename(
      typeof e.filename === "string" ? e.filename : "",
      opts.imageOnly ? "image.png" : "attachment",
    );

    if (opts.imageOnly && !contentType.startsWith("image/")) {
      return { ok: false, error: "Inline items must be images" };
    }
    if (!opts.imageOnly) {
      if (BLOCKED_CONTENT_TYPES.has(contentType) || BLOCKED_EXTENSIONS.has(fileExtension(filename))) {
        return { ok: false, error: `That file type can't be attached (${filename})` };
      }
    }

    items.push({ filename, content, ...(contentType ? { contentType } : {}) });
  }
  return { ok: true, items, rawBytes };
}

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

  const attachments = sanitizeList(body.attachments, { max: MAX_ATTACHMENTS, imageOnly: false, label: "attachments" });
  if (!attachments.ok) return NextResponse.json({ error: attachments.error }, { status: 400 });
  const inlineImages = sanitizeList(body.inlineImages, { max: MAX_INLINE_IMAGES, imageOnly: true, label: "inline images" });
  if (!inlineImages.ok) return NextResponse.json({ error: inlineImages.error }, { status: 400 });

  if (attachments.rawBytes + inlineImages.rawBytes > MAX_TOTAL_RAW_BYTES) {
    return NextResponse.json(
      { error: `Attachments are too large together (max ${MAX_TOTAL_RAW_BYTES / (1024 * 1024)} MB total)` },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {
    subject: subject.slice(0, 200),
    body: replyBody.slice(0, 32000),
    author: "human-support",
  };
  if (typeof body.advanceStatus === "string" && ALLOWED_STATUSES.has(body.advanceStatus)) {
    payload.advanceStatus = body.advanceStatus;
  }
  if (attachments.items.length) payload.attachments = attachments.items;
  if (inlineImages.items.length) payload.inlineImages = inlineImages.items;

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
      attachments: attachments.items.length,
      inlineImages: inlineImages.items.length,
    },
  });

  return NextResponse.json({ ok: true, resendMessageId: result.data.resendMessageId ?? null });
}
