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
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cleanString,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES = new Set(["bug", "feature", "praise", "other"]);
const MESSAGE_MIN = 3;
const MESSAGE_MAX = 4000;

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
  const email = auth.ok ? auth.auth.email : null;

  const admin = createAdminClient();
  const { error } = await admin.from("extension_feedback").insert({
    user_id: userId,
    email,
    feedback_type: feedbackType,
    message,
    page_url: cleanString(input.page_url, 500),
    ext_version: cleanString(input.ext_version, 20),
    browser: cleanString(input.browser, 40),
  });

  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/feedback: insert failed", error);
    return jsonWithCors({ error: "Could not save feedback" }, 500);
  }

  return jsonWithCors({ ok: true });
}
