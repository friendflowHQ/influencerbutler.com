// Override-with-fallback for the built-in email funnels. The hardcoded copy in
// the src/lib/*-emails.ts files is the DEFAULT; an admin can override any
// step's subject/body/tag/timing via the email_funnel_overrides table (edited
// from the Sequences tab). The send path renders the override when present,
// else the code default, so an empty table = current behavior exactly and the
// conversion-driving emails can never break on a bad/absent override.

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { contentKeyFallbacks } from "@/lib/funnel-types";

export type FunnelOverride = {
  funnel: string;
  tier: string;
  subject: string | null;
  body: string | null;
  applyTag: string | null;
  dayOffset: number | null;
  enabled: boolean;
  /** Last save/reset time and actor (columns exist since 20260819). */
  updatedAt: string | null;
  updatedBy: string | null;
  /** "Mark reviewed" stamp (20261110_funnels_v2_measure); null before it. */
  reviewedAt: string | null;
  reviewedBy: string | null;
};

/** Substitutes {{key}} placeholders with vars[key]; unknown keys become "". */
export function renderTemplate(tpl: string, vars: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const v = vars[key];
    return v === undefined || v === null ? "" : String(v);
  });
}

const OVERRIDE_SELECTS = [
  // Full (reviewed_* needs 20261110_funnels_v2_measure).
  "funnel, tier, subject, body, apply_tag, day_offset, enabled, updated_at, updated_by, reviewed_at, reviewed_by",
  // Before 20261110.
  "funnel, tier, subject, body, apply_tag, day_offset, enabled, updated_at, updated_by",
  // The original select, in case a hand-built table lacks the stamp columns.
  "funnel, tier, subject, body, apply_tag, day_offset, enabled",
];

function isMissingColumn(error: unknown): boolean {
  const code = typeof error === "object" && error !== null ? (error as { code?: string }).code : undefined;
  return code === "42703" || code === "PGRST204";
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Loads every override keyed "funnel:tier" (tier may be a Funnels v2 content
 * key such as "day5.beginner"). Best-effort: empty on a missing table or any
 * error, so callers always fall back to code copy. Missing stamp columns
 * degrade to null stamps. */
export async function loadFunnelOverrides(db: SupabaseClient): Promise<Map<string, FunnelOverride>> {
  const map = new Map<string, FunnelOverride>();
  try {
    let data: Record<string, unknown>[] | null = null;
    for (const sel of OVERRIDE_SELECTS) {
      const res = await db.from("email_funnel_overrides").select(sel);
      if (!res.error) {
        data = (res.data ?? []) as unknown as Record<string, unknown>[];
        break;
      }
      if (!isMissingColumn(res.error)) return map;
    }
    if (!data) return map;
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
        updatedAt: strOrNull(row.updated_at),
        updatedBy: strOrNull(row.updated_by),
        reviewedAt: strOrNull(row.reviewed_at),
        reviewedBy: strOrNull(row.reviewed_by),
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

const DAY_MS = 24 * 60 * 60 * 1000;

/** Effective age threshold (ms) for a funnel step: the admin's day_offset
 * override when set, else the code default. Used by the funnel crons so an
 * unedited step keeps its exact code schedule. */
export function tierThresholdMs(
  overrides: Map<string, FunnelOverride>,
  funnel: string,
  tier: string,
  defaultMs: number,
): number {
  const ov = overrides.get(`${funnel}:${tier}`);
  return ov && ov.dayOffset != null ? ov.dayOffset * DAY_MS : defaultMs;
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

/** True when an override row carries real content. A reset-as-blank row keeps
 * its stamps (for "last updated" history) but is not an override. */
export function isOverrideActive(ov: FunnelOverride | undefined | null): boolean {
  return Boolean(
    ov &&
      ov.enabled &&
      ((ov.subject && ov.subject.trim().length > 0) ||
        (ov.body && ov.body.trim().length > 0) ||
        ov.applyTag ||
        ov.dayOffset != null),
  );
}

export type ResolvedKeyCopy = ResolvedCopy & {
  /** Which key supplied each field: "override:<key>" or "code:<key>"
   * (e.g. "code:day5.mod-walmart"); "" when nothing supplied it. */
  subjectSource: string;
  bodySource: string;
};

/** Funnels v2 resolution for a content key. Walks contentKeyFallbacks(key),
 * most specific first, and at each key tries the admin override THEN the code
 * default for exactly that key:
 *   1. exact-key override
 *   2. code track/module default for that key
 *      (intermediate keys repeat 1-2, e.g. day5.mod-walmart for day5.mod-walmart.power)
 *   3. bare-tier override
 *   4. bare code default
 * So a bare-tier override can never beat tailored code copy. Subject and body
 * resolve independently (first non-empty wins); disabled overrides and blank
 * fields are skipped. applyTag comes from the first enabled override in the
 * chain that sets one. `codeDefaultForKey(k)` returns code copy for exactly
 * key k (a bare k = the bare code default) or null; system-funnels
 * makeCodeDefaultForKey(funnel, vars) builds it. For a bare key the result's
 * subject/body/applyTag equal resolveFunnelCopy's. */
export function resolveFunnelCopyForKey(args: {
  funnel: string;
  contentKey: string;
  vars: Record<string, unknown>;
  overrides: Map<string, FunnelOverride>;
  codeDefaultForKey: (key: string) => { subject: string; body: string } | null;
}): ResolvedKeyCopy {
  let subject: string | null = null;
  let body: string | null = null;
  let subjectSource = "";
  let bodySource = "";
  let applyTag: string | null = null;

  for (const k of contentKeyFallbacks(args.contentKey)) {
    const ov = args.overrides.get(`${args.funnel}:${k}`);
    if (ov && ov.enabled) {
      if (applyTag === null && ov.applyTag) applyTag = ov.applyTag;
      if (subject === null && ov.subject && ov.subject.trim().length > 0) {
        subject = renderTemplate(ov.subject, args.vars);
        subjectSource = `override:${k}`;
      }
      if (body === null && ov.body && ov.body.trim().length > 0) {
        body = renderTemplate(ov.body, args.vars);
        bodySource = `override:${k}`;
      }
    }
    // Both fields settled: keep walking only to pick up an applyTag.
    if (subject !== null && body !== null) continue;
    let code: { subject: string; body: string } | null = null;
    try {
      code = args.codeDefaultForKey(k);
    } catch {
      code = null;
    }
    if (!code) continue;
    if (subject === null && code.subject) {
      subject = code.subject;
      subjectSource = `code:${k}`;
    }
    if (body === null && code.body) {
      body = code.body;
      bodySource = `code:${k}`;
    }
  }

  return { subject: subject ?? "", body: body ?? "", applyTag, subjectSource, bodySource };
}
