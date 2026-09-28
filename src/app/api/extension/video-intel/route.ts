/**
 * /api/extension/video-intel - the shared VIDEO placement catalogue.
 *
 * POST (extension, Bearer license key): a signed-in creator who has turned ON
 * the "contribute to catalogue" setting sends, per product they viewed, the
 * list of creator videos currently in the carousel (a stable video id, the
 * creator, the carousel side and position). We upsert ONE row per
 * (video_id, asin, marketplace, observed_day) so every contributor who saw the
 * product that day collapses into a single row, and history accumulates one row
 * per day. De-identified: contributor_user_id is audit-only, never returned.
 *
 * GET (dashboard session cookie or extension Bearer): the per-video "passport"
 * over the last 90 days - presence rate, product reach, placement stability
 * (rotation), a daily visibility series, upper/lower share, and the current
 * snapshot. These are inherently longitudinal, so the response is HONEST about
 * cold start: until enough distinct days have accrued it returns
 * collecting: true and withholds the rate/rotation metrics rather than dividing
 * by a window that has not happened yet. A day with no contributor observation
 * is "no data", never "video absent".
 */
import { resolveAuth, resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ASIN_RE,
  EXT_MAX_BATCH,
  EXT_TITLE_MAX,
  MARKETPLACE_RE,
  cleanString,
  clampInt,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
  parseTimestamp,
} from "@/lib/extension-api";
import { WINDOW_DAYS, buildPassport, type DayRow } from "@/lib/video-passport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Cap on videos accepted per product observation, and total rows per request.
const MAX_VIDEOS_PER_ITEM = 200;
const MAX_ROWS = 2000;
const VIDEO_ID_MAX = 200;
const CREATOR_TYPES = new Set(["influencer", "brand", "customer", "unknown"]);
const CAROUSELS = new Set(["upper", "lower", "unknown"]);

export async function OPTIONS() {
  return optionsResponse();
}

type ObservationRow = {
  asin: string;
  marketplace: string;
  video_id: string;
  creator_id: string | null;
  creator_name: string | null;
  creator_type: string;
  carousel: string;
  position: number | null;
  title: string | null;
  video_url: string | null;
  observed_day: string;
  observed_at: string;
  contributor_user_id: string;
};

function toObservedDay(iso: string): string {
  // UTC calendar day, derived server-side so the client cannot skew the key.
  return iso.slice(0, 10);
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
  const items = (body as { items?: unknown })?.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `items must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  const rows: ObservationRow[] = [];
  for (const rawItem of items) {
    if (rows.length >= MAX_ROWS) break;
    const item = rawItem as Record<string, unknown>;
    const asin = typeof item.asin === "string" ? item.asin.toUpperCase() : "";
    const marketplace = typeof item.marketplace === "string" ? item.marketplace.toLowerCase() : "";
    const observedAt = parseTimestamp(item.observed_at);
    if (!ASIN_RE.test(asin) || !MARKETPLACE_RE.test(marketplace) || !observedAt) continue;
    const videos = Array.isArray(item.videos) ? item.videos.slice(0, MAX_VIDEOS_PER_ITEM) : [];
    const observedDay = toObservedDay(observedAt);

    for (const rawVideo of videos) {
      if (rows.length >= MAX_ROWS) break;
      const v = rawVideo as Record<string, unknown>;
      const videoId = cleanString(v.video_id, VIDEO_ID_MAX);
      if (!videoId) continue;
      const creatorType =
        typeof v.creator_type === "string" && CREATOR_TYPES.has(v.creator_type)
          ? v.creator_type
          : "unknown";
      const carousel =
        typeof v.carousel === "string" && CAROUSELS.has(v.carousel) ? v.carousel : "unknown";
      rows.push({
        asin,
        marketplace,
        video_id: videoId,
        creator_id: cleanString(v.creator_id, VIDEO_ID_MAX),
        creator_name: cleanString(v.creator_name, EXT_TITLE_MAX),
        creator_type: creatorType,
        carousel,
        position: clampInt(v.position, 1, 100_000),
        title: cleanString(v.title, EXT_TITLE_MAX),
        video_url: cleanString(v.video_url, EXT_TITLE_MAX),
        observed_day: observedDay,
        observed_at: observedAt,
        contributor_user_id: auth.auth.userId,
      });
    }
  }

  if (rows.length === 0) {
    return jsonWithCors({ error: "No valid observations in batch" }, 400);
  }

  // Collapse to one row per (video_id, asin, marketplace, observed_day) within
  // this request so the batch upsert does not fight itself on the conflict key.
  const byKey = new Map<string, ObservationRow>();
  for (const row of rows) {
    const key = `${row.video_id}:${row.asin}:${row.marketplace}:${row.observed_day}`;
    const prev = byKey.get(key);
    if (!prev || row.observed_at > prev.observed_at) byKey.set(key, row);
  }
  const deduped = Array.from(byKey.values());

  const admin = createAdminClient();
  const { error: obsError } = await admin
    .from("product_video_observations")
    .upsert(deduped, { onConflict: "video_id,asin,marketplace,observed_day" });
  if (obsError) {
    if (isMissingTableError(obsError)) return migrationPendingResponse();
    console.error("extension/video-intel: observation upsert failed", obsError);
    return jsonWithCors({ error: "Could not save observations" }, 500);
  }

  // Upsert the current snapshot, keeping the newest observation per placement.
  const latestByKey = new Map<string, ObservationRow>();
  for (const row of deduped) {
    const key = `${row.video_id}:${row.asin}:${row.marketplace}`;
    const prev = latestByKey.get(key);
    if (!prev || row.observed_at > prev.observed_at) latestByKey.set(key, row);
  }
  const now = new Date().toISOString();
  const snapshots = Array.from(latestByKey.values()).map((row) => ({
    video_id: row.video_id,
    asin: row.asin,
    marketplace: row.marketplace,
    creator_id: row.creator_id,
    creator_name: row.creator_name,
    creator_type: row.creator_type,
    carousel: row.carousel,
    position: row.position,
    title: row.title,
    video_url: row.video_url,
    last_observed_at: row.observed_at,
    updated_at: now,
  }));
  const { error: latestError } = await admin
    .from("product_video_latest")
    .upsert(snapshots, { onConflict: "video_id,asin,marketplace" });
  if (latestError) {
    // Observations already landed; a snapshot failure is non-fatal (reads fall
    // back to the log), so log and still report success for the upsert.
    console.error("extension/video-intel: latest upsert failed", latestError);
  }

  return jsonWithCors({ ok: true, recorded: deduped.length });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const marketplace = (url.searchParams.get("marketplace") ?? "amazon.com").toLowerCase();
  if (!MARKETPLACE_RE.test(marketplace)) {
    return jsonWithCors({ error: "Invalid marketplace" }, 400);
  }
  const videoId = (url.searchParams.get("videoId") ?? "").trim().slice(0, VIDEO_ID_MAX);
  if (!videoId) {
    return jsonWithCors({ error: "videoId is required" }, 400);
  }

  const admin = createAdminClient();
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);

  const { data: obsData, error: obsError } = await admin
    .from("product_video_observations")
    .select("observed_day, asin, carousel, position")
    .eq("video_id", videoId)
    .eq("marketplace", marketplace)
    .gte("observed_day", since)
    .order("observed_day", { ascending: true });
  if (obsError) {
    if (isMissingTableError(obsError)) return migrationPendingResponse();
    console.error("extension/video-intel: observation read failed", obsError);
    return jsonWithCors({ error: "Could not load video data" }, 500);
  }

  const { data: firstRow } = await admin
    .from("product_video_observations")
    .select("observed_day")
    .eq("video_id", videoId)
    .eq("marketplace", marketplace)
    .order("observed_day", { ascending: true })
    .limit(1)
    .maybeSingle();

  const { data: latestRows } = await admin
    .from("product_video_latest")
    .select("asin, carousel, position, creator_name, creator_type, title, video_url, last_observed_at")
    .eq("video_id", videoId)
    .eq("marketplace", marketplace);

  const rows = (obsData ?? []) as DayRow[];
  const passport = buildPassport(rows, firstRow?.observed_day ?? null);

  const snapshot = (latestRows ?? []).map((r) => ({
    asin: r.asin,
    carousel: r.carousel,
    position: r.position,
    creatorName: r.creator_name,
    creatorType: r.creator_type,
    title: r.title,
    videoUrl: r.video_url,
    lastObservedAt: r.last_observed_at,
  }));
  const lastObserved = snapshot.reduce<string | null>(
    (max, s) => (s.lastObservedAt && (!max || s.lastObservedAt > max) ? s.lastObservedAt : max),
    null,
  );

  // Pooled placement data carries no per-user content, so it is safe to cache
  // at the edge by URL, same as the market route.
  return jsonWithCors({ ok: true, videoId, ...passport, snapshot, lastObserved }, 200);
}
