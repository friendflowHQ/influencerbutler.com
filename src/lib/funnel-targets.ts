// Goal targets for funnel activation % and paid % (Funnels v2).
//
// Stored in app_config under key `email_funnel_targets` as
//   { "system:trial": { activation: 0.8, paid: 0.8, updated_at, updated_by },
//     "seq:<uuid>":   { ... } }
// No migration needed (app_config exists since 20260618). A key with no entry,
// or a metric with a bad value, reads as the 0.8 default.

import type { SupabaseClient } from "@supabase/supabase-js";

export const FUNNEL_TARGETS_KEY = "email_funnel_targets";
export const DEFAULT_TARGET = 0.8;
export const MIN_TARGET = 0.01;
export const MAX_TARGET = 1;

export type TargetMetric = "activation" | "paid";
export const TARGET_METRICS: readonly TargetMetric[] = ["activation", "paid"];

export type TargetEntry = {
  activation: number;
  paid: number;
  updated_at: string | null;
  updated_by: string | null;
};
export type FunnelTargets = Record<string, TargetEntry>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM_KEY_RE = /^system:[a-z0-9_]{1,40}$/;

/** "system:<funnel>" or "seq:<uuid>". */
export function isValidTargetKey(key: unknown): key is string {
  if (typeof key !== "string") return false;
  if (SYSTEM_KEY_RE.test(key)) return true;
  return key.startsWith("seq:") && UUID_RE.test(key.slice(4));
}

export function systemTargetKey(funnel: string): string {
  return `system:${funnel}`;
}

export function sequenceTargetKey(id: string): string {
  return `seq:${id}`;
}

export function isTargetMetric(v: unknown): v is TargetMetric {
  return v === "activation" || v === "paid";
}

/** A usable target in 0.01..1, or null. Accepts numeric strings. */
export function parseTargetValue(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return null;
  if (n < MIN_TARGET || n > MAX_TARGET) return null;
  return Math.round(n * 10_000) / 10_000;
}

/** Clamps anything numeric into 0.01..1; non-numbers become the default. */
export function clampTarget(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_TARGET;
  return Math.min(MAX_TARGET, Math.max(MIN_TARGET, n));
}

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Normalizes the stored app_config value. Garbage in -> {} (all defaults). */
export function parseTargets(raw: unknown): FunnelTargets {
  const out: FunnelTargets = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const [key, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (!isValidTargetKey(key)) continue;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const e = entry as Record<string, unknown>;
    out[key] = {
      activation: e.activation === undefined ? DEFAULT_TARGET : clampTarget(e.activation),
      paid: e.paid === undefined ? DEFAULT_TARGET : clampTarget(e.paid),
      updated_at: strOrNull(e.updated_at),
      updated_by: strOrNull(e.updated_by),
    };
  }
  return out;
}

/** Targets for one key, defaults filled in. */
export function targetFor(targets: FunnelTargets, key: string): { activation: number; paid: number } {
  const e = targets[key];
  return { activation: e?.activation ?? DEFAULT_TARGET, paid: e?.paid ?? DEFAULT_TARGET };
}

/** Returns a new targets object with one metric changed and the entry stamped. */
export function applyTarget(
  targets: FunnelTargets,
  key: string,
  metric: TargetMetric,
  value: number,
  actor: string | null,
  now: string = new Date().toISOString(),
): FunnelTargets {
  const prev = targetFor(targets, key);
  return {
    ...targets,
    [key]: { ...prev, [metric]: clampTarget(value), updated_at: now, updated_by: actor },
  };
}

/** Reads app_config email_funnel_targets. Never throws; {} on any error. */
export async function getFunnelTargets(db: SupabaseClient): Promise<FunnelTargets> {
  try {
    const { data, error } = await db
      .from("app_config")
      .select("value")
      .eq("key", FUNNEL_TARGETS_KEY)
      .maybeSingle();
    if (error || !data) return {};
    return parseTargets((data as { value?: unknown }).value);
  } catch {
    return {};
  }
}

export type SetTargetResult = { ok: true; targets: FunnelTargets } | { ok: false; error: string; status: number };

/** Validates and writes one target. Read-modify-write on the single JSON row
 * (admin-only and rare, so last write wins is acceptable). */
export async function setFunnelTarget(
  db: SupabaseClient,
  key: unknown,
  metric: unknown,
  value: unknown,
  actor: string | null,
): Promise<SetTargetResult> {
  if (!isValidTargetKey(key)) return { ok: false, error: "Invalid target key", status: 400 };
  if (!isTargetMetric(metric)) return { ok: false, error: "Invalid metric", status: 400 };
  const v = parseTargetValue(value);
  if (v === null) return { ok: false, error: "Target must be between 0.01 and 1", status: 400 };
  const current = await getFunnelTargets(db);
  const now = new Date().toISOString();
  const next = applyTarget(current, key, metric, v, actor, now);
  try {
    const { error } = await db.from("app_config").upsert(
      { key: FUNNEL_TARGETS_KEY, value: next, updated_at: now, updated_by: actor ?? "admin" },
      { onConflict: "key" },
    );
    if (error) {
      console.error("funnel-targets: upsert failed", error);
      return { ok: false, error: "Save failed", status: 500 };
    }
  } catch (err) {
    console.error("funnel-targets: upsert threw", err);
    return { ok: false, error: "Save failed", status: 500 };
  }
  return { ok: true, targets: next };
}
