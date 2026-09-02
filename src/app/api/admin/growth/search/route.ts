/**
 * GET /api/admin/growth/search[?refresh=1]
 *
 * Google Search Console panel data: top search queries and top landing pages
 * from organic search over the last 28 days (clicks, impressions, CTR,
 * position). This is what GA4 cannot show, since Google strips query keywords
 * from Analytics.
 *
 * Mirrors /api/admin/growth/ga: cached in app_config ('growth_gsc_cache') with a
 * 1-hour TTL; ?refresh=1 bypasses the TTL; stale cache is served over an empty
 * panel on error. Returns { configured: false } until GSC_SITE_URL + the service
 * account exist, so the dashboard can render its "Connect Search Console" card.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { isGscConfigured, fetchGscSummary, type GscSummary } from "@/lib/gsc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "growth_gsc_cache";
const CACHE_TTL_MS = 60 * 60 * 1000;

type CacheClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

type CachedSummary = { fetched_at: string; data: GscSummary };

async function readCache(db: CacheClient | null): Promise<CachedSummary | null> {
  if (!db) return null;
  try {
    const { data, error } = await db
      .from("app_config")
      .select("value")
      .eq("key", CACHE_KEY)
      .maybeSingle();
    if (error || !data) return null;
    const v = data.value as CachedSummary | null;
    if (!v || typeof v.fetched_at !== "string" || !v.data) return null;
    return v;
  } catch {
    return null;
  }
}

async function writeCache(db: CacheClient | null, summary: GscSummary): Promise<void> {
  if (!db) return;
  const { error } = await db.from("app_config").upsert(
    {
      key: CACHE_KEY,
      value: { fetched_at: new Date().toISOString(), data: summary },
      updated_at: new Date().toISOString(),
      updated_by: "admin:growth",
    },
    { onConflict: "key" },
  );
  if (error) console.error("growth gsc: cache write failed", error);
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isGscConfigured()) {
    return NextResponse.json({ admin: { email: actor.email }, configured: false });
  }

  const db = createAdminClient() as unknown as CacheClient | null;
  const wantRefresh = new URL(request.url).searchParams.has("refresh");

  const cached = await readCache(db);
  const cacheAgeMs = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
  const cacheFresh = Number.isFinite(cacheAgeMs) && cacheAgeMs < CACHE_TTL_MS;

  let summary: GscSummary | null = null;
  let cachedAt: string | null = null;
  let gscError = false;
  let errorDetail: string | null = null;

  if (cached && cacheFresh && !wantRefresh) {
    summary = cached.data;
    cachedAt = cached.fetched_at;
  } else {
    const result = await fetchGscSummary();
    if (result.summary) {
      summary = result.summary;
      cachedAt = new Date().toISOString();
      await writeCache(db, summary);
    } else if (cached) {
      // Serve stale data over an empty panel.
      summary = cached.data;
      cachedAt = cached.fetched_at;
      gscError = true;
      errorDetail = result.error;
    } else {
      gscError = true;
      errorDetail = result.error;
    }
  }

  return NextResponse.json({
    admin: { email: actor.email },
    configured: true,
    error: gscError,
    errorDetail,
    cachedAt,
    topQueries: summary?.topQueries ?? null,
    topPages: summary?.topPages ?? null,
  });
}
