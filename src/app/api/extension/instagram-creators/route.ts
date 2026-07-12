/**
 * /api/extension/instagram-creators - Instagram creators harvested by the
 * extension's Instagram Goldmine tool (self-hosted build only): one row per
 * (username, email). This is the browser counterpart to the desktop Instagram
 * Goldmine runner, syncing harvested creator + bio-email rows to the caller's
 * Influencer Butler workspace.
 *
 * POST (extension, Bearer license key): upsert a batch keyed on
 * (user_id, username, email). A repeat harvest of the same pair is idempotent
 * (newest data wins).
 * GET (dashboard or extension): recent creators newest-first.
 */
import { resolveAuth, resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXT_MAX_BATCH,
  EXT_TITLE_MAX,
  cleanString,
  clampInt,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
  parseTimestamp,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Instagram handles are 1-30 chars of letters, digits, periods, underscores.
const USERNAME_RE = /^[a-z0-9._]{1,30}$/;
const EMAIL_RE = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

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
  const creators = (body as { creators?: unknown })?.creators;
  if (!Array.isArray(creators) || creators.length === 0 || creators.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `creators must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  const now = new Date().toISOString();
  const rows = [];
  for (const raw of creators) {
    const creator = raw as Record<string, unknown>;
    const username =
      typeof creator.username === "string" ? creator.username.trim().toLowerCase() : "";
    const email = typeof creator.email === "string" ? creator.email.trim().toLowerCase() : "";
    const detectedAt = parseTimestamp(creator.detected_at);
    if (!USERNAME_RE.test(username) || !EMAIL_RE.test(email) || !detectedAt) {
      continue;
    }
    rows.push({
      user_id: auth.auth.userId,
      username,
      email,
      source_hashtag: cleanString(creator.source_hashtag, 200),
      full_name: cleanString(creator.full_name, EXT_TITLE_MAX),
      follower_count: clampInt(creator.follower_count, 0, 5_000_000_000),
      engagement_rate_pct: clampFloat(creator.engagement_rate_pct, 0, 1000),
      bio_link_url: cleanString(creator.bio_link_url, 2000),
      post_url: cleanString(creator.post_url, 2000),
      detected_at: detectedAt,
      updated_at: now,
    });
  }
  if (rows.length === 0) {
    return jsonWithCors({ error: "No valid creators in batch" }, 400);
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("extension_instagram_creators")
    .upsert(rows, { onConflict: "user_id,username,email" });
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/instagram-creators: upsert failed", error);
    return jsonWithCors({ error: "Could not save creators" }, 500);
  }

  return jsonWithCors({ ok: true, upserted: rows.length });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 200), 1, 500) ?? 200;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_instagram_creators")
    .select(
      "username, email, source_hashtag, full_name, follower_count, engagement_rate_pct, bio_link_url, post_url, detected_at",
    )
    .eq("user_id", auth.auth.userId)
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/instagram-creators: list failed", error);
    return jsonWithCors({ error: "Could not load creators" }, 500);
  }

  return jsonWithCors({ ok: true, creators: data ?? [] });
}

// Percent to two decimals, clamped. Mirrors clampInt but keeps fractional
// engagement rates (e.g. 3.42%).
function clampFloat(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const clamped = Math.min(max, Math.max(min, value));
  return Math.round(clamped * 100) / 100;
}
