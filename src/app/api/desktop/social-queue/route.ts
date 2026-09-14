/**
 * GET /api/desktop/social-queue - the desktop app pulls scheduled posts the
 * creator queued from the extension, to mirror into its local Social Posting
 * Butler library (which owns the scheduler daemon + publish pipeline + calendar).
 *
 * Bearer license key. This is a CLAIM: it atomically flips the returned rows from
 * `pending` to `claimed` (guarded on status = 'pending'), so a second signed-in
 * desktop polling at the same time can never pull the same row and double-post.
 * The desktop persists each claimed row to its durable local library, publishes
 * at the scheduled time, and reports back via POST .../social-queue/status.
 *
 * Idempotency: the desktop keys each local record on the backend row id
 * (importHash), so a re-pull can never create a duplicate.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clampInt,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";
import { SOCIAL_POST_SELECT } from "@/lib/social-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 50), 1, 200) ?? 50;

  const admin = createAdminClient();

  // Pick a bounded batch of this creator's pending posts, oldest first. Two
  // steps because PostgREST cannot LIMIT an UPDATE: select the ids, then claim
  // exactly those, still guarded on status = 'pending' so the flip stays atomic.
  const pending = await admin
    .from("scheduled_social_posts")
    .select("id")
    .eq("user_id", auth.auth.userId)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (pending.error) {
    if (isMissingTableError(pending.error)) return migrationPendingResponse();
    console.error("desktop/social-queue: pending select failed", pending.error);
    return jsonWithCors({ error: "Could not load the queue" }, 500);
  }
  const ids = (pending.data ?? []).map((r) => r.id).filter(Boolean);
  if (ids.length === 0) {
    return jsonWithCors({ ok: true, posts: [] });
  }

  const { data, error } = await admin
    .from("scheduled_social_posts")
    .update({ status: "claimed", claimed_at: new Date().toISOString() })
    .in("id", ids)
    .eq("user_id", auth.auth.userId)
    .eq("status", "pending")
    .select(SOCIAL_POST_SELECT);
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("desktop/social-queue: claim failed", error);
    return jsonWithCors({ error: "Could not claim the queue" }, 500);
  }

  return jsonWithCors({ ok: true, posts: data ?? [] });
}
