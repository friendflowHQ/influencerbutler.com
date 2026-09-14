/**
 * /api/extension/social-posts - the backend queue behind the extension's "click
 * an image, schedule a post" flow.
 *
 * POST (extension, Bearer license key): create one scheduled post. It lands as a
 * `pending` row that the desktop app later pulls (GET /api/desktop/social-queue),
 * mirrors into its local Social Posting Butler library, and publishes.
 * GET (dashboard or extension): the creator's own scheduled posts, newest-first,
 * for the mini calendar / upcoming view. Optional ?status= and ?limit=.
 */
import { resolveAuth, resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  clampInt,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";
import { SOCIAL_POST_SELECT, validateSocialPost, type SocialStatus } from "@/lib/social-posts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const READABLE_STATUSES: SocialStatus[] = [
  "pending",
  "claimed",
  "posted",
  "canceled",
  "failed",
];

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

  const validated = validateSocialPost(body);
  if (!validated.ok) return jsonWithCors({ error: validated.error }, 400);

  const now = new Date().toISOString();
  const row = {
    user_id: auth.auth.userId,
    ...validated.fields,
    status: "pending" as SocialStatus,
    source: "extension",
    created_at: now,
    updated_at: now,
  };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("scheduled_social_posts")
    .insert(row)
    .select("id")
    .single();
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/social-posts: insert failed", error);
    return jsonWithCors({ error: "Could not schedule the post" }, 500);
  }

  return jsonWithCors({ ok: true, id: data?.id ?? null });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 100), 1, 500) ?? 100;
  const statusParam = url.searchParams.get("status");
  const status =
    statusParam && READABLE_STATUSES.includes(statusParam as SocialStatus)
      ? (statusParam as SocialStatus)
      : null;

  const admin = createAdminClient();
  let query = admin
    .from("scheduled_social_posts")
    .select(SOCIAL_POST_SELECT)
    .eq("user_id", auth.auth.userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/social-posts: list failed", error);
    return jsonWithCors({ error: "Could not load scheduled posts" }, 500);
  }

  return jsonWithCors({ ok: true, posts: data ?? [] });
}
