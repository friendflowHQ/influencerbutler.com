/**
 * GET /api/admin/growth/ga[?refresh=1]
 *
 * Google Analytics panel data: 28-day users trend (with the prior 28 days
 * for deltas), traffic channels, top pages, and realtime active users.
 *
 * The batch summary is cached in app_config ('growth_ga_cache') with a
 * 1-hour TTL to stay far inside GA's core quota (~24 calls/day); ?refresh=1
 * bypasses the TTL. Realtime is fetched fresh each load (separate, generous
 * quota). Returns { configured: false } until the service-account env vars
 * exist, so the dashboard can render its "Connect GA" card.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { isGaConfigured, fetchGaSummary, fetchGaRealtime, type GaSummary } from "@/lib/ga4";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_KEY = "growth_ga_cache";
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

type CachedSummary = { fetched_at: string; data: GaSummary };

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

async function writeCache(db: CacheClient | null, summary: GaSummary): Promise<void> {
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
  if (error) console.error("growth ga: cache write failed", error);
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isGaConfigured()) {
    return NextResponse.json({ admin: { email: actor.email }, configured: false });
  }

  const db = createAdminClient() as unknown as CacheClient | null;
  const wantRefresh = new URL(request.url).searchParams.has("refresh");

  const cached = await readCache(db);
  const cacheAgeMs = cached ? Date.now() - new Date(cached.fetched_at).getTime() : Infinity;
  const cacheFresh = Number.isFinite(cacheAgeMs) && cacheAgeMs < CACHE_TTL_MS;

  let summary: GaSummary | null = null;
  let cachedAt: string | null = null;
  let gaError = false;

  if (cached && cacheFresh && !wantRefresh) {
    summary = cached.data;
    cachedAt = cached.fetched_at;
  } else {
    summary = await fetchGaSummary();
    if (summary) {
      cachedAt = new Date().toISOString();
      await writeCache(db, summary);
    } else if (cached) {
      // Serve stale data over an empty panel.
      summary = cached.data;
      cachedAt = cached.fetched_at;
      gaError = true;
    } else {
      gaError = true;
    }
  }

  const realtimeActiveUsers = await fetchGaRealtime();

  return NextResponse.json({
    admin: { email: actor.email },
    configured: true,
    error: gaError,
    cachedAt,
    realtimeActiveUsers,
    trend: summary?.trend ?? null,
    channels: summary?.channels ?? null,
    topPages: summary?.topPages ?? null,
  });
}
