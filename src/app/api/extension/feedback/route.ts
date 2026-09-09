/**
 * POST /api/extension/feedback - Feedback Butler for the Chrome extension.
 *
 * Optional auth: the extension is free and mostly anonymous, so feedback is
 * accepted WITHOUT a license. If the caller sends a valid Bearer license key,
 * the row is attributed to that user; otherwise it is stored anonymously. This
 * is deliberate: the people most worth hearing from often never sign in.
 *
 * Single submission per request (a user clicks Send), not a batch. CORS and
 * the migrationPending soft-fail follow the other /api/extension/* routes.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { submitSupportTicket } from "@/lib/support-worker";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cleanString,
  isMissingColumnError,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["bug", "feature", "question", "praise", "other"]);
const MESSAGE_MIN = 3;
const MESSAGE_MAX = 4000;
const TITLE_MAX = 200;
const LOGS_MAX = 20000;
const SCREENSHOT_MAX_COUNT = 6;
const SCREENSHOT_MIME_ALLOW = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
// Base64 of a 4 MB image is ~5.4 MB; cap each a little above that and the whole
// set well under a sane row size. Oversized entries are dropped, not fatal.
const SCREENSHOT_B64_MAX = 6 * 1024 * 1024;
const SCREENSHOTS_TOTAL_B64_MAX = 24 * 1024 * 1024;

// Keep only well-formed, allowed, in-cap screenshots. Never throws: a bad entry
// is dropped so a report with one huge image still saves the rest.
function sanitizeScreenshots(raw: unknown): Array<{ base64: string; mime: string; filename: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ base64: string; mime: string; filename: string }> = [];
  let total = 0;
  for (const item of raw) {
    if (out.length >= SCREENSHOT_MAX_COUNT) break;
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const base64 = typeof rec.base64 === "string" ? rec.base64 : "";
    const mime = typeof rec.mime === "string" ? rec.mime : "";
    const filename = typeof rec.filename === "string" ? rec.filename.slice(0, 200) : "screenshot.png";
    if (!base64 || !SCREENSHOT_MIME_ALLOW.has(mime)) continue;
    if (base64.length > SCREENSHOT_B64_MAX) continue;
    if (total + base64.length > SCREENSHOTS_TOTAL_B64_MAX) break;
    total += base64.length;
    out.push({ base64, mime, filename });
  }
  return out;
}

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  // Soft origin filter: real submissions come from the extension or our site.
  // Not a security boundary (Origin is spoofable), just casual-abuse friction.
  const origin = request.headers.get("origin") ?? "";
  if (origin && !/^chrome-extension:\/\//.test(origin) && !origin.includes("influencerbutler.com")) {
    return jsonWithCors({ error: "Forbidden" }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const input = body as Record<string, unknown>;

  const message = cleanString(input.message, MESSAGE_MAX);
  if (!message || message.length < MESSAGE_MIN) {
    return jsonWithCors({ error: "Message is required" }, 400);
  }
  // Honeypot: a hidden field real users never fill. Bots that fill every input
  // get a silent success so they do not retry.
  if (cleanString(input.website, 100)) {
    return jsonWithCors({ ok: true });
  }

  const feedbackType =
    typeof input.feedback_type === "string" && TYPES.has(input.feedback_type)
      ? input.feedback_type
      : "other";

  // Attribute to a user only when a valid license key is presented.
  const auth = await resolveLicenseOnly(request);
  const userId = auth.ok ? auth.auth.userId : null;
  const licenseEmail = auth.ok ? auth.auth.email : null;

  // Rich fields from the chat bubble's Report view (optional; the minimal popup
  // form omits them). A user-supplied reply email wins over the license email so
  // anonymous reporters can still ask for a reply.
  const title = cleanString(input.title, TITLE_MAX);
  const userEmail = cleanString(input.user_email, 200);
  const email = userEmail || licenseEmail;
  const logs = cleanString(input.logs, LOGS_MAX);
  const screenshots = sanitizeScreenshots(input.screenshots);

  // The rich columns (title / logs / screenshots) ship in a separate migration.
  // Only reference them when the caller actually sent something, so the minimal
  // popup form (which sends none) keeps saving even before the migration is
  // applied. The bubble sends a title, so it needs the migration to be applied.
  const row: Record<string, unknown> = {
    user_id: userId,
    email,
    feedback_type: feedbackType,
    message,
    page_url: cleanString(input.page_url, 500),
    ext_version: cleanString(input.ext_version, 20),
    browser: cleanString(input.browser, 40),
  };
  if (title) row.title = title;
  if (logs) row.logs = logs;
  if (screenshots.length) row.screenshots = screenshots;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_feedback")
    .insert(row)
    .select("id")
    .single();

  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/feedback: insert failed", error);
    return jsonWithCors({ error: "Could not save feedback" }, 500);
  }

  // Mirror actionable feedback into the feedback Worker (D1), the same support
  // inbox the desktop app uses, so a bug/feature/question becomes a conversation
  // the user can follow and reply to in-app (GET /api/extension/feedback/replies).
  // The Supabase row above stays for the existing admin dashboard; praise/other
  // are not tickets, so they stay Supabase-only. Best-effort: a Worker hiccup
  // must never fail the submission. When it succeeds we return the D1 ticket id
  // so the bubble's local "My reports" keys to the same thread the reply lands on.
  let d1Id: string | null = null;
  if (feedbackType === "bug" || feedbackType === "feature" || feedbackType === "question") {
    try {
      const filed = await submitSupportTicket({
        type: feedbackType,
        title: title || message.slice(0, 120),
        description: message,
        userEmail: email || undefined,
        platform: "extension",
        appVersion: cleanString(input.ext_version, 20) || undefined,
      });
      if (filed.ok && filed.id) {
        d1Id = filed.id;
        // Link the Supabase row to its D1 ticket so the backlog backfill skips
        // it. Best-effort and tolerant of the d1_ticket_id column not being
        // applied yet (the mirror still worked; only the link is deferred).
        if (data?.id) {
          const { error: linkErr } = await admin
            .from("extension_feedback")
            .update({ d1_ticket_id: d1Id })
            .eq("id", data.id);
          if (linkErr && !isMissingColumnError(linkErr)) {
            console.error("extension/feedback: d1_ticket_id link failed", linkErr);
          }
        }
      }
    } catch (err) {
      console.error("extension/feedback: D1 mirror failed", err);
    }
  }

  return jsonWithCors({ ok: true, id: d1Id ?? data?.id ?? null });
}
