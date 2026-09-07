// DOM-free helpers shared by the chat bubble's Report view (the in-page feedback
// submission that mirrors the desktop app's bubble). Holds the screenshot
// validation caps, the reply-email shape check, the submit-payload builder, and
// the reversible PII-block splice used by cross-surface handoffs. Kept pure so it
// can be unit-tested without a DOM and reused verbatim by the bubble. Ported from
// the desktop repo's renderer/components/feedback-report-core.js.

export type FeedbackType = "bug" | "feature" | "question";

export type Screenshot = {
  base64: string;
  mime: string;
  filename: string;
  bytes: number;
};

export type ReportForm = {
  type: FeedbackType;
  title: string;
  description: string;
  userEmail: string;
  attachLogs: boolean;
  screenshots: Screenshot[];
};

export type SubmitPayload = {
  type: FeedbackType;
  title: string;
  description: string;
  userEmail: string;
  attachLogs: boolean;
  screenshots?: Array<{ base64: string; mime: string; filename: string }>;
  screenshotBase64?: string;
  screenshotMime?: string;
  screenshotFilename?: string;
};

// Screenshot caps, identical to the desktop values so a report built here passes
// the shared validation untouched.
export const SCREENSHOT_MAX_BYTES = 4 * 1024 * 1024; // 4 MB raw
export const SCREENSHOT_MAX_COUNT = 6; // per-report cap; keeps the request body sane
export const SCREENSHOT_MIME_ALLOW = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;
const SCREENSHOT_MIME_SET = new Set<string>(SCREENSHOT_MIME_ALLOW);

// PII markers. A cross-surface handoff (e.g. a captured page context) wraps a
// personal-identifiers block in these HTML comment markers so it can be pulled
// out and put back without ambiguity. String-based (no regex) so a stray
// regex-special inside the user's edits can never trip the splice.
export const PII_START = "<!-- IB:PII-START -->";
export const PII_END = "<!-- IB:PII-END -->";

// Live, non-blocking reply-email shape check. A typo never blocks the send; the
// hint just warns we will not be able to reply.
export const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmailShaped(value: unknown): boolean {
  return EMAIL_SHAPE_RE.test(String(value == null ? "" : value).trim());
}

export function formatBytes(n: unknown): string {
  const num = typeof n === "number" ? n : Number(n);
  if (!isFinite(num)) return "0 B";
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / 1024 / 1024).toFixed(2)} MB`;
}

// Validate a candidate screenshot against the count / MIME / size caps BEFORE
// base64-encoding it, so a huge image never gets read into memory.
export function validateScreenshot(input: {
  mime: string;
  bytes: number;
  currentCount: number;
}): { ok: boolean; error?: string } {
  if (Number(input.currentCount) >= SCREENSHOT_MAX_COUNT) {
    return { ok: false, error: `You can attach up to ${SCREENSHOT_MAX_COUNT} screenshots.` };
  }
  if (!SCREENSHOT_MIME_SET.has(input.mime)) {
    return { ok: false, error: "Only PNG, JPEG, GIF, or WebP images are accepted" };
  }
  if (Number(input.bytes) > SCREENSHOT_MAX_BYTES) {
    return {
      ok: false,
      error: `That image is ${formatBytes(input.bytes)}. Max is ${formatBytes(SCREENSHOT_MAX_BYTES)}.`,
    };
  }
  return { ok: true };
}

// Build the exact payload the feedback submit expects, including the legacy
// single-screenshot mirror (first image) so an older server that predates the
// `screenshots` array still stores one attachment.
export function buildSubmitPayload(form: Partial<ReportForm>): SubmitPayload {
  const screenshots = Array.isArray(form.screenshots) ? form.screenshots : [];
  const type: FeedbackType =
    form.type === "feature" || form.type === "question" ? form.type : "bug";
  const payload: SubmitPayload = {
    type,
    title: String(form.title == null ? "" : form.title).trim(),
    description: String(form.description == null ? "" : form.description).trim(),
    userEmail: String(form.userEmail == null ? "" : form.userEmail).trim(),
    attachLogs: form.attachLogs !== false,
  };
  const first = screenshots[0];
  if (first) {
    payload.screenshots = screenshots.map((s) => ({
      base64: s.base64,
      mime: s.mime,
      filename: s.filename,
    }));
    payload.screenshotBase64 = first.base64;
    payload.screenshotMime = first.mime;
    payload.screenshotFilename = first.filename;
  }
  return payload;
}

// Extract the PII marker block from `text`. `block` is the marker pair plus
// everything between them (markers included), or "" when absent.
export function extractPiiBlock(text: string): { stripped: string; block: string } {
  if (typeof text !== "string" || !text) return { stripped: text || "", block: "" };
  const startIdx = text.indexOf(PII_START);
  if (startIdx < 0) return { stripped: text, block: "" };
  const endIdx = text.indexOf(PII_END, startIdx + PII_START.length);
  if (endIdx < 0) return { stripped: text, block: "" };
  const blockEnd = endIdx + PII_END.length;
  let trimStart = startIdx;
  if (text[trimStart - 1] === "\n") trimStart -= 1;
  const stripped = text.slice(0, trimStart) + text.slice(blockEnd);
  const block = text.slice(startIdx, blockEnd);
  return { stripped, block };
}

// Re-insert a previously-extracted PII `block` into `text`. Idempotent: a no-op
// when the block is empty or already present.
export function splicePiiInto(text: string, block: string): string {
  if (!block) return text;
  if (typeof text !== "string") return block;
  if (text.indexOf(PII_START) >= 0) return text;
  const sep = text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}\n${block}`;
}
