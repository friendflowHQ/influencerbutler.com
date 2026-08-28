// Growth dashboard goals: monthly auto-suggestions + achievement stamping.
//
// On the first dashboard load of each month, ensureSuggestions() proposes a
// goal per goalable metric (~10% over last month's actual, with sensible
// floors for a young product), guarded by an app_config marker + the
// growth_goals (month, metric) unique constraint so reloads never duplicate.
// The admin then accepts, edits, or dismisses each suggestion.
//
// stampAchievements() marks accepted goals whose actual has crossed the
// target. `celebrated_at` is stamped separately by the UI so the confetti
// fires exactly once per goal.

import { GROWTH_METRICS, type GrowthSnapshot } from "@/lib/growth-metrics";

/**
 * Suggested starting targets when last month's actual was 0 (or the metric
 * has no history yet). Metrics missing here are skipped at zero baseline so
 * the goals list never fills with unreachable or trivial goals.
 */
export const DEFAULT_FLOOR: Record<string, number> = {
  trial_clicks: 10,
  trials_started: 2,
  trial_conversions: 1,
  download_leads: 5,
  new_subscriptions: 1,
  affiliate_signups: 1,
  affiliate_clicks: 10,
  testimonials: 1,
  email_subscribers: 5,
};

/**
 * Target suggestion: 10% over last month (at least +1), or the metric's
 * floor when starting from zero. Returns null when no sensible goal exists.
 */
export function suggestTarget(metric: string, lastMonthActual: number | null): number | null {
  if (lastMonthActual !== null && lastMonthActual > 0) {
    // (n * 11) / 10 instead of n * 1.1: exact for integers, no FP drift.
    return Math.max(lastMonthActual + 1, Math.ceil((lastMonthActual * 11) / 10));
  }
  const floor = DEFAULT_FLOOR[metric];
  return typeof floor === "number" ? floor : null;
}

export type GrowthGoal = {
  id: string;
  month: string;
  metric: string;
  target: number;
  baseline: number | null;
  status: "suggested" | "accepted" | "dismissed";
  achievedAt: string | null;
  celebratedAt: string | null;
  /** The metric's actual for the month, from the snapshot. */
  current: number | null;
  /** Achieved but confetti not fired yet. */
  needsCelebration: boolean;
};

type GoalRow = {
  id?: unknown;
  month?: unknown;
  metric?: unknown;
  target?: unknown;
  baseline?: unknown;
  status?: unknown;
  achieved_at?: unknown;
  celebrated_at?: unknown;
};

type GoalsQueryResult = {
  data: Record<string, unknown>[] | null;
  error: { message?: string; code?: string } | null;
};

export type GoalsClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: unknown) => PromiseLike<GoalsQueryResult> & {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      rows: Record<string, unknown> | Record<string, unknown>[],
      opts?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => Promise<{ error: { message?: string; code?: string } | null }>;
    update: (values: Record<string, unknown>) => {
      eq: (col: string, value: unknown) => {
        is: (col: string, value: null) => Promise<{ error: unknown }>;
      };
    };
  };
};

/** True when the error looks like "relation does not exist" (42P01). */
export function isMissingTable(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01") return true;
  return /does not exist/i.test(error.message ?? "");
}

// ---------------------------------------------------------------------------
// Per-month one-shot markers in app_config (growth_month_<YYYY-MM>)
// ---------------------------------------------------------------------------

export type MonthMarker = {
  goals_suggested_at?: string;
  checklist_seeded_at?: string;
  checklist_celebrated_at?: string;
};

export async function readMonthMarker(supabase: GoalsClient, month: string): Promise<MonthMarker> {
  try {
    const { data, error } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", `growth_month_${month}`)
      .maybeSingle();
    if (error || !data) return {};
    return (data.value && typeof data.value === "object" ? data.value : {}) as MonthMarker;
  } catch {
    return {};
  }
}

export async function writeMonthMarker(
  supabase: GoalsClient,
  month: string,
  patch: Partial<MonthMarker>,
): Promise<void> {
  const existing = await readMonthMarker(supabase, month);
  const { error } = await supabase.from("app_config").upsert(
    {
      key: `growth_month_${month}`,
      value: { ...existing, ...patch },
      updated_at: new Date().toISOString(),
      updated_by: "admin:growth",
    },
    { onConflict: "key" },
  );
  if (error) console.error("growth: month marker upsert failed", error);
}

// ---------------------------------------------------------------------------
// Suggestions + achievements
// ---------------------------------------------------------------------------

/**
 * Seeds this month's suggested goals once. Baseline is last month's actual;
 * active_subscriptions (a point-in-time metric) baselines on the current
 * count instead.
 */
export async function ensureSuggestions(
  supabase: GoalsClient,
  month: string,
  snapshot: GrowthSnapshot,
): Promise<{ migrationPending: boolean }> {
  const marker = await readMonthMarker(supabase, month);
  if (marker.goals_suggested_at) return { migrationPending: false };

  const rows: Record<string, unknown>[] = [];
  for (const def of GROWTH_METRICS) {
    if (!def.goalable) continue;
    const snap = snapshot.metrics[def.key];
    if (!snap) continue;
    const baseline = def.key === "active_subscriptions" ? snap.current : snap.previous;
    const target = suggestTarget(def.key, baseline);
    if (target === null) continue;
    rows.push({
      month,
      metric: def.key,
      target,
      baseline,
      status: "suggested",
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase
      .from("growth_goals")
      .upsert(rows, { onConflict: "month,metric", ignoreDuplicates: true });
    if (error) {
      if (isMissingTable(error)) return { migrationPending: true };
      console.error("growth: goal suggestion upsert failed", error);
      return { migrationPending: false };
    }
  }

  await writeMonthMarker(supabase, month, { goals_suggested_at: new Date().toISOString() });
  return { migrationPending: false };
}

/**
 * Loads a month's goals, stamps freshly-achieved ones, and returns them with
 * current values + celebration flags. Returns null rows + migrationPending
 * when the growth_goals table is not in prod yet.
 */
export async function loadGoalsWithAchievements(
  supabase: GoalsClient,
  month: string,
  snapshot: GrowthSnapshot,
): Promise<{ goals: GrowthGoal[] | null; migrationPending: boolean }> {
  const res = await supabase.from("growth_goals").select("*").eq("month", month);
  const { data, error } = await res;
  if (error) {
    if (isMissingTable(error)) return { goals: null, migrationPending: true };
    console.error("growth: goals query failed", error);
    return { goals: null, migrationPending: false };
  }

  const goals: GrowthGoal[] = [];
  for (const raw of (data ?? []) as GoalRow[]) {
    const id = typeof raw.id === "string" ? raw.id : null;
    const metric = typeof raw.metric === "string" ? raw.metric : null;
    if (!id || !metric) continue;
    const target = Number(raw.target);
    if (!Number.isFinite(target)) continue;
    const status =
      raw.status === "accepted" || raw.status === "dismissed" ? raw.status : "suggested";
    const current = snapshot.metrics[metric]?.current ?? null;
    let achievedAt = typeof raw.achieved_at === "string" ? raw.achieved_at : null;
    const celebratedAt = typeof raw.celebrated_at === "string" ? raw.celebrated_at : null;

    // Freshly achieved: stamp it (best-effort; guarded so we never overwrite).
    if (status === "accepted" && achievedAt === null && current !== null && current >= target) {
      const nowIso = new Date().toISOString();
      const { error: stampErr } = await supabase
        .from("growth_goals")
        .update({ achieved_at: nowIso, updated_at: nowIso })
        .eq("id", id)
        .is("achieved_at", null);
      if (!stampErr) achievedAt = nowIso;
    }

    goals.push({
      id,
      month,
      metric,
      target,
      baseline: Number.isFinite(Number(raw.baseline)) && raw.baseline !== null ? Number(raw.baseline) : null,
      status,
      achievedAt,
      celebratedAt,
      current,
      needsCelebration: status === "accepted" && achievedAt !== null && celebratedAt === null,
    });
  }

  // Accepted first (achieved on top), then suggestions; dismissed last.
  const rank = (g: GrowthGoal) =>
    g.status === "accepted" ? (g.achievedAt ? 0 : 1) : g.status === "suggested" ? 2 : 3;
  goals.sort((a, b) => rank(a) - rank(b) || a.metric.localeCompare(b.metric));

  return { goals, migrationPending: false };
}
