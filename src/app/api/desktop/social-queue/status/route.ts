/**
 * POST /api/desktop/social-queue/status - the desktop app reports the outcome of
 * a scheduled post it claimed. Bearer license key.
 *
 * Body: { id, status: 'posted' | 'failed' | 'claimed', error? }.
 *   - posted: the desktop published it (sets posted_at).
 *   - failed: the desktop could not publish (e.g. it could not download the
 *     image); `error` carries a short reason and the extension can offer the
 *     upload fallback.
 *   - claimed: a heartbeat re-assert (rarely needed; the GET already claims).
 * Only rows the caller owns are updated.
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

const ALLOWED = new Set(["posted", "failed", "claimed"]);

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  const status = typeof o.status === "string" ? o.status : "";
  if (!id || !ALLOWED.has(status)) {
    return jsonWithCors({ error: "id and a valid status are required" }, 400);
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (status === "posted") patch.posted_at = now;
  if (status === "failed") patch.error = cleanString(o.error, 500);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scheduled_social_posts")
    .update(patch)
    .eq("id", id)
    .eq("user_id", auth.auth.userId)
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("desktop/social-queue/status: update failed", error);
    return jsonWithCors({ error: "Could not update status" }, 500);
  }
  if (!data) {
    return jsonWithCors({ error: "Post not found" }, 404);
  }
  return jsonWithCors({ ok: true });
}
