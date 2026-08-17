// Override-with-fallback for the built-in email funnels. The hardcoded copy in
// the src/lib/*-emails.ts files is the DEFAULT; an admin can override any
// step's subject/body/tag/timing via the email_funnel_overrides table (edited
// from the Sequences tab). The send path renders the override when present,
// else the code default, so an empty table = current behavior exactly and the
// conversion-driving emails can never break on a bad/absent override.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type FunnelOverride = {
  funnel: string;
  tier: string;
  subject: string | null;
  body: string | null;
  applyTag: string | null;
  dayOffset: number | null;
  enabled: boolean;
};

/** Substitutes {{key}} placeholders with vars[key]; unknown keys become "". */
export function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

/** Loads every override keyed "funnel:tier". Best-effort: empty on a missing
 * table or any error, so callers always fall back to code copy. */
export async function loadFunnelOverrides(db: SupabaseClient): Promise<Map<string, FunnelOverride>> {
  const map = new Map<string, FunnelOverride>();
  try {
    const { data, error } = await db
      .from("email_funnel_overrides")
      .select("funnel, tier, subject, body, apply_tag, day_offset, enabled");
    if (error || !data) return map;
    for (const row of data) {
      if (typeof row.funnel !== "string" || typeof row.tier !== "string") continue;
      map.set(`${row.funnel}:${row.tier}`, {
        funnel: row.funnel,
        tier: row.tier,
        subject: (row.subject as string | null) ?? null,
        body: (row.body as string | null) ?? null,
        applyTag: (row.apply_tag as string | null) ?? null,
        dayOffset: typeof row.day_offset === "number" ? row.day_offset : null,
        enabled: row.enabled !== false,
      });
    }
  } catch {
    // table missing / not configured: no overrides
  }
  return map;
}

// Small in-process cache so a cron batch (many sends in a loop) loads overrides
// once, not once per recipient. TTL keeps edits taking effect within a minute.
let cache: Map<string, FunnelOverride> | null = null;
let cacheAt = 0;
const TTL_MS = 60_000;

/** Cached override map for the send path. Creates its own admin client; never
 * throws (returns the last cache or an empty map on failure). */
export async function getFunnelOverrides(): Promise<Map<string, FunnelOverride>> {
  const now = Date.now();
  if (cache && now - cacheAt < TTL_MS) return cache;
  try {
    const db = createAdminClient();
    cache = await loadFunnelOverrides(db);
    cacheAt = now;
  } catch {
    cache = cache ?? new Map();
  }
  return cache;
}

export type ResolvedCopy = { subject: string; body: string; applyTag: string | null };

/** Merges an override (if any) over the code defaults, rendering override
 * templates against the same vars the send function already computed. */
export function resolveFunnelCopy(args: {
  funnel: string;
  tier: string;
  vars: Record<string, unknown>;
  defaults: { subject: string; body: string };
  overrides: Map<string, FunnelOverride>;
}): ResolvedCopy {
  const ov = args.overrides.get(`${args.funnel}:${args.tier}`);
  if (!ov || !ov.enabled) {
    return { subject: args.defaults.subject, body: args.defaults.body, applyTag: null };
  }
  const subject =
    ov.subject && ov.subject.trim().length > 0
      ? renderTemplate(ov.subject, args.vars)
      : args.defaults.subject;
  const body =
    ov.body && ov.body.trim().length > 0 ? renderTemplate(ov.body, args.vars) : args.defaults.body;
  return { subject, body, applyTag: ov.applyTag };
}
