// Shared intake + validation for email attachments and inline images.
//
// Both the admin support-reply route and the admin email-campaigns route accept
// files/images as base64 in a JSON body and must apply identical caps: the JSON
// payload has to stay under Vercel's ~4.5 MB request-body limit, and base64
// inflates raw bytes by ~33%, so the raw total is capped at 3 MB. Keeping the
// validation here means one source of truth for filename sanitization, size
// caps, and the executable-type blocklist.

export type NormalizedAttachment = {
  filename: string;
  content: string; // base64
  contentType?: string;
};

export const ATTACHMENT_LIMITS = {
  maxAttachments: 5,
  maxInlineImages: 5,
  maxItemRawBytes: 3 * 1024 * 1024,
  maxTotalRawBytes: 3 * 1024 * 1024,
  maxFilenameLen: 200,
};

// Content types / extensions we refuse outright (executables / scripts). Not
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

// Characters reserved in filenames plus control chars. Built from char codes so
// the source stays plain ASCII.
const RESERVED_FILENAME_CHARS = new Set(
  ['<', '>', ':', '"', '|', '?', '*'].concat(
    Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)),
  ),
);

/** Rough raw byte count of a base64 string without allocating a Buffer. */
export function base64RawBytes(b64: string): number {
  const len = b64.length;
  if (len === 0) return 0;
  let padding = 0;
  if (b64.endsWith("==")) padding = 2;
  else if (b64.endsWith("=")) padding = 1;
  return Math.floor((len * 3) / 4) - padding;
}

export function sanitizeFilename(name: string, fallback: string): string {
  const base = (name || "").split(/[\\/]/).pop() || fallback;
  let cleaned = "";
  for (const ch of base) {
    if (!RESERVED_FILENAME_CHARS.has(ch)) cleaned += ch;
  }
  cleaned = cleaned.trim();
  return (cleaned || fallback).slice(0, ATTACHMENT_LIMITS.maxFilenameLen);
}

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export type SanitizeResult =
  | { ok: true; items: NormalizedAttachment[]; rawBytes: number }
  | { ok: false; error: string };

/**
 * Validate/normalize one list of attachments from an untrusted request body.
 * `imageOnly` gates inline images to image/* content types; otherwise the
 * executable blocklist applies.
 */
export function sanitizeAttachmentList(
  raw: unknown,
  opts: { max: number; imageOnly: boolean; label: string },
): SanitizeResult {
  if (raw == null) return { ok: true, items: [], rawBytes: 0 };
  if (!Array.isArray(raw)) return { ok: false, error: `${opts.label} must be an array` };
  if (raw.length > opts.max) {
    return { ok: false, error: `Too many ${opts.label} (max ${opts.max})` };
  }

  const items: NormalizedAttachment[] = [];
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
    if (bytes > ATTACHMENT_LIMITS.maxItemRawBytes) {
      return { ok: false, error: `A file is too large (max ${ATTACHMENT_LIMITS.maxItemRawBytes / (1024 * 1024)} MB)` };
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

/**
 * Intake both lists (downloadable attachments + inline images) from a request
 * body and enforce the combined total cap. Returns normalized items or a
 * user-facing error message.
 */
export function intakeAttachments(body: {
  attachments?: unknown;
  inlineImages?: unknown;
}): { ok: true; attachments: NormalizedAttachment[]; inlineImages: NormalizedAttachment[] } | { ok: false; error: string } {
  const attachments = sanitizeAttachmentList(body.attachments, {
    max: ATTACHMENT_LIMITS.maxAttachments,
    imageOnly: false,
    label: "attachments",
  });
  if (!attachments.ok) return { ok: false, error: attachments.error };
  const inlineImages = sanitizeAttachmentList(body.inlineImages, {
    max: ATTACHMENT_LIMITS.maxInlineImages,
    imageOnly: true,
    label: "inline images",
  });
  if (!inlineImages.ok) return { ok: false, error: inlineImages.error };

  if (attachments.rawBytes + inlineImages.rawBytes > ATTACHMENT_LIMITS.maxTotalRawBytes) {
    return {
      ok: false,
      error: `Attachments are too large together (max ${ATTACHMENT_LIMITS.maxTotalRawBytes / (1024 * 1024)} MB total)`,
    };
  }
  return { ok: true, attachments: attachments.items, inlineImages: inlineImages.items };
}
