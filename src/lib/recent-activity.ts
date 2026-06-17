// Recent-activity social-proof widget: shared data layer.
//
// Writes here are ALL best-effort: every public-facing flow that calls them
// (trial-click redirect, checkout, the Lemon Squeezy webhook) must never break
// because of an activity write, so each function swallows its own errors and
// returns void. If the migration (20260618_recent_activity.sql) has not been
// applied to prod yet, these simply no-op and the widget stays empty.
//
// Reads are done server-side with the service-role key; the public read route
// returns only non-identifying fields. See src/app/api/activity/recent.

import { createServerClient } from "@supabase/ssr";

export type Geo = {
  city: string | null;
  region: string | null;
  country: string | null;
};

export type ActivityKind = "trial_click" | "purchase";

/** Public-safe shape returned to the marketing-site widget. */
export type PublicActivity = {
  kind: ActivityKind;
  firstName: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  createdAt: string;
};

/** Full row shape used by the admin curation page (includes hidden + bot). */
export type AdminActivity = PublicActivity & {
  id: number;
  planLabel: string | null;
  source: string | null;
  isBot: boolean;
  hidden: boolean;
};

export type ActivityConfig = {
  enabled: boolean;
  windowMinutes: number;
  maxCount: number;
};

export const DEFAULT_ACTIVITY_CONFIG: ActivityConfig = {
  enabled: true,
  windowMinutes: 1440,
  maxCount: 5,
};

const CONFIG_KEY = "activity_widget";

// Loose service-role client. We hand-roll the minimal surface we use so we
// don't depend on a generated Database type. Mirrors the casting pattern in
// src/lib/admin.ts and the lemonsqueezy webhook.
type Filter = {
  eq: (col: string, val: unknown) => Filter;
  gte: (col: string, val: unknown) => Filter;
  order: (col: string, opts: { ascending: boolean }) => Filter;
  limit: (n: number) => Promise<{ data: Array<Record<string, unknown>> | null; error: unknown }>;
  maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
};
type ServiceDb = {
  from: (table: string) => {
    insert: (rows: Record<string, unknown>) => Promise<{ error: unknown }>;
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, val: unknown) => Promise<{ error: unknown }>;
    };
    select: (cols: string) => Filter;
  };
};

function serviceDb(): ServiceDb | null {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  return createServerClient(url, key, {
    cookies: { getAll() { return []; }, setAll() { /* stateless */ } },
  }) as unknown as ServiceDb;
}

// Vercel URL-encodes the city header (e.g. "San%20Francisco").
function decodeCity(value: string | null): string | null {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** Reads the visitor's approximate location from Vercel's edge geo headers. */
export function readGeo(headers: Headers): Geo {
  return {
    city: decodeCity(headers.get("x-vercel-ip-city")),
    region: headers.get("x-vercel-ip-country-region") || null,
    country: headers.get("x-vercel-ip-country") || null,
  };
}

/** Returns the first word of a full name (for purchase social proof). */
export function firstNameFrom(fullName: string | null | undefined): string | null {
  if (!fullName) return null;
  const first = fullName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first.slice(0, 40) : null;
}

// --------------------------------------------------------------------------
// Writes (best-effort)
// --------------------------------------------------------------------------

/** Records a genuine trial-click for the widget feed. Never throws. */
export async function logTrialClickActivity(params: {
  geo: Geo;
  source: string | null;
}): Promise<void> {
  try {
    const db = serviceDb();
    if (!db) return;
    const { error } = await db.from("activity_events").insert({
      kind: "trial_click",
      city: params.geo.city,
      region: params.geo.region,
      country: params.geo.country,
      source: params.source,
      is_bot: false,
    });
    if (error) console.error("logTrialClickActivity: insert failed", error);
  } catch (err) {
    console.error("logTrialClickActivity threw", err);
  }
}

/** Stashes the buyer's geo keyed by welcome_token for the webhook. Never throws. */
export async function upsertCheckoutGeo(welcomeToken: string, geo: Geo): Promise<void> {
  if (!welcomeToken) return;
  try {
    const db = serviceDb();
    if (!db) return;
    const { error } = await db.from("checkout_geo").upsert(
      {
        welcome_token: welcomeToken,
        city: geo.city,
        region: geo.region,
        country: geo.country,
      },
      { onConflict: "welcome_token" },
    );
    if (error) console.error("upsertCheckoutGeo: upsert failed", error);
  } catch (err) {
    console.error("upsertCheckoutGeo threw", err);
  }
}

/** Records a purchase for the widget feed, pulling geo from checkout_geo. Never throws. */
export async function logPurchaseActivity(params: {
  geoKey: string | null;
  firstName: string | null;
  planLabel: string | null;
}): Promise<void> {
  try {
    const db = serviceDb();
    if (!db) return;

    let geo: Geo = { city: null, region: null, country: null };
    if (params.geoKey) {
      const { data } = await db
        .from("checkout_geo")
        .select("city,region,country")
        .eq("welcome_token", params.geoKey)
        .maybeSingle();
      if (data) {
        geo = {
          city: (data.city as string | null) ?? null,
          region: (data.region as string | null) ?? null,
          country: (data.country as string | null) ?? null,
        };
      }
    }

    const { error } = await db.from("activity_events").insert({
      kind: "purchase",
      first_name: params.firstName,
      city: geo.city,
      region: geo.region,
      country: geo.country,
      plan_label: params.planLabel,
      is_bot: false,
    });
    if (error) console.error("logPurchaseActivity: insert failed", error);
  } catch (err) {
    console.error("logPurchaseActivity threw", err);
  }
}

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

function coerceConfig(raw: unknown): ActivityConfig {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const windowMinutes = Number(v.window_minutes);
  const maxCount = Number(v.max_count);
  return {
    enabled: v.enabled !== false,
    windowMinutes:
      Number.isFinite(windowMinutes) && windowMinutes > 0
        ? Math.min(Math.round(windowMinutes), 60 * 24 * 30)
        : DEFAULT_ACTIVITY_CONFIG.windowMinutes,
    maxCount:
      Number.isFinite(maxCount) && maxCount > 0
        ? Math.min(Math.round(maxCount), 20)
        : DEFAULT_ACTIVITY_CONFIG.maxCount,
  };
}

export async function readActivityConfig(): Promise<ActivityConfig> {
  try {
    const db = serviceDb();
    if (!db) return DEFAULT_ACTIVITY_CONFIG;
    const { data, error } = await db
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_ACTIVITY_CONFIG;
    return coerceConfig(data.value);
  } catch {
    return DEFAULT_ACTIVITY_CONFIG;
  }
}

export async function writeActivityConfig(
  next: ActivityConfig,
  updatedBy: string | null,
): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const { error } = await db.from("app_config").upsert(
    {
      key: CONFIG_KEY,
      value: {
        enabled: next.enabled,
        window_minutes: next.windowMinutes,
        max_count: next.maxCount,
      },
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("writeActivityConfig: upsert failed", error);
    return false;
  }
  return true;
}

// --------------------------------------------------------------------------
// Reads
// --------------------------------------------------------------------------

function toPublic(row: Record<string, unknown>): PublicActivity {
  return {
    kind: (row.kind as ActivityKind) ?? "trial_click",
    firstName: (row.first_name as string | null) ?? null,
    city: (row.city as string | null) ?? null,
    region: (row.region as string | null) ?? null,
    country: (row.country as string | null) ?? null,
    createdAt: (row.created_at as string) ?? new Date().toISOString(),
  };
}

/** Latest non-hidden, non-bot events within the configured window. */
export async function getPublicRecentActivity(): Promise<{
  enabled: boolean;
  events: PublicActivity[];
}> {
  const config = await readActivityConfig();
  if (!config.enabled) return { enabled: false, events: [] };

  const db = serviceDb();
  if (!db) return { enabled: true, events: [] };

  const sinceIso = new Date(Date.now() - config.windowMinutes * 60_000).toISOString();
  try {
    const { data, error } = await db
      .from("activity_events")
      .select("kind,first_name,city,region,country,created_at")
      .eq("hidden", false)
      .eq("is_bot", false)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(config.maxCount);
    if (error || !data) return { enabled: true, events: [] };
    return { enabled: true, events: data.map(toPublic) };
  } catch {
    return { enabled: true, events: [] };
  }
}

/** Recent events for the admin curation list (includes hidden + bot rows). */
export async function listAdminActivity(limit = 50): Promise<AdminActivity[]> {
  const db = serviceDb();
  if (!db) return [];
  try {
    const { data, error } = await db
      .from("activity_events")
      .select("id,kind,first_name,city,region,country,plan_label,source,is_bot,hidden,created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((row) => ({
      ...toPublic(row),
      id: Number(row.id),
      planLabel: (row.plan_label as string | null) ?? null,
      source: (row.source as string | null) ?? null,
      isBot: row.is_bot === true,
      hidden: row.hidden === true,
    }));
  } catch {
    return [];
  }
}

export async function setActivityHidden(id: number, hidden: boolean): Promise<boolean> {
  const db = serviceDb();
  if (!db) return false;
  const { error } = await db
    .from("activity_events")
    .update({ hidden })
    .eq("id", String(id));
  if (error) {
    console.error("setActivityHidden: update failed", error);
    return false;
  }
  return true;
}
