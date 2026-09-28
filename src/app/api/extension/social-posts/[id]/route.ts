/**
 * /api/extension/social-posts/[id] - edit or cancel one scheduled post.
 *
 * PATCH (extension, Bearer license key): either cancel a still-pending post
 * ({ status: "canceled" }) or edit its content/schedule (same body shape as the
 * create route). Only rows the caller owns AND that are still `pending` can be
 * changed: once the desktop has claimed a post, the desktop owns it.
 * DELETE: alias for cancel.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";
import { validateSocialPost } from "@/lib/social-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

async function cancel(userId: string, id: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scheduled_social_posts")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/social-posts[id]: cancel failed", error);
    return jsonWithCors({ error: "Could not cancel the post" }, 500);
  }
  if (!data) {
    return jsonWithCors({ error: "Post not found or already claimed" }, 409);
  }
  return jsonWithCors({ ok: true, canceled: true });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const { id } = await context.params;
  if (!id) return jsonWithCors({ error: "Missing id" }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  // Cancel is a status-only PATCH.
  const status = (body as { status?: unknown })?.status;
  if (status === "canceled") {
    return cancel(auth.auth.userId, id);
  }

  // Otherwise this is a full content/schedule edit; validate like create.
  const validated = validateSocialPost(body);
  if (!validated.ok) return jsonWithCors({ error: validated.error }, 400);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scheduled_social_posts")
    .update({ ...validated.fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", auth.auth.userId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/social-posts[id]: update failed", error);
    return jsonWithCors({ error: "Could not update the post" }, 500);
  }
  if (!data) {
    return jsonWithCors({ error: "Post not found or already claimed" }, 409);
  }
  return jsonWithCors({ ok: true, id: data.id });
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);
  const { id } = await context.params;
  if (!id) return jsonWithCors({ error: "Missing id" }, 400);
  return cancel(auth.auth.userId, id);
}
