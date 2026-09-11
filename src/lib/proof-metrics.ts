// Proof-of-numbers counters: shared data layer.
//
// Powers the live "X deals posted, Y products scanned, Z campaigns accepted"
// counter on the marketing homepage (public read route:
// src/app/api/proof-numbers). Every value is a genuine cumulative count plus a
// configurable baseline offset (so the counter reads as established at launch),
// held in app_config under the key `proof_metrics`.
//
// Reads are best-effort and never throw: a failed count, a missing service-role
// key, or an unapplied migration (20260910_client_action_events.sql) degrades
// that metric to its baseline (or the whole feature to disabled) rather than
// breaking the page. All reads go through the service-role client, and the
// public route returns only aggregate numbers, never any per-user data.

import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";

export type ProofMetricKey =
  | "deals_posted"
  | "product_scans"
  | "orders_analyzed"
  | "campaigns_accepted"
  | "social_posts_published"
  | "creator_messaged"
  | "benable_list_optimized";

// How a metric is counted. Some actions already land in their own table
// (deals, scans) and are counted directly; others (campaign accepts) never
// otherwise touch our backend and are summed from client_action_events via the
// pre-aggregated client_action_totals view.
type ProofSource =
  | { kind: "table_count"; table: string }
  | { kind: "events_total"; metric: string };

type ProofMetricDef = {
  key: ProofMetricKey;
  defaultLabel: string;
  source: ProofSource;
};

// The v1 registry. Adding a metric (for example the desktop app's
// 'creator_messaged' or 'benable_list_optimized') is one entry here plus a
// baseline in DEFAULT_PROOF_CONFIG - no route or table change, because the
// ingest table is metric-generic.
export const PROOF_METRICS: ProofMetricDef[] = [
  {
    key: "deals_posted",
    defaultLabel: "Deals Posted",
    source: { kind: "table_count", table: "extension_deals" },
  },
  {
    key: "product_scans",
    defaultLabel: "Products Scanned",
    source: { kind: "table_count", table: "extension_product_scans" },
  },
  {
    key: "orders_analyzed",
    defaultLabel: "Orders Analyzed",
    source: { kind: "table_count", table: "extension_orders" },
  },
  {
    key: "campaigns_accepted",
    // Amazon's program is "Creator Connections"; accepting one is exactly this
    // event, so the public tile uses that name.
    defaultLabel: "Creator Connections Accepted",
    source: { kind: "events_total", metric: "campaign_accepted" },
  },
  // Reported by the desktop app (separate repo, separate release cadence): they
  // read 0 until a desktop build that reports them ships, or until a baseline
  // is set. See src/app/api/desktop/actions. social_posts_published needs the
  // desktop app to POST action 'social_post_published' (whitelisted in that
  // route) before its live count moves; until then it shows its baseline only.
  {
    key: "social_posts_published",
    defaultLabel: "Social Posts Posted",
    source: { kind: "events_total", metric: "social_post_published" },
  },
  {
    key: "creator_messaged",
    defaultLabel: "Brands Messaged",
    source: { kind: "events_total", metric: "creator_messaged" },
  },
  {
    key: "benable_list_optimized",
    defaultLabel: "Benable Lists Optimized",
    source: { kind: "events_total", metric: "benable_list_optimized" },
  },
];

export type ProofConfig = {
  enabled: boolean;
  // A fixed number added to each metric's live count. Zero by default; an
  // admin sets a credible starting number per metric.
  baselines: Record<ProofMetricKey, number>;
  // Optional per-metric label overrides (fall back to defaultLabel).
  labels: Partial<Record<ProofMetricKey, string>>;
};

export const DEFAULT_PROOF_CONFIG: ProofConfig = {
  enabled: true,
  baselines: {
    // Credible starting numbers so the counter reads as an established product
    // while the live DB counts tick up on top of these. Chosen to sit in a
    // believable funnel order (scan many products, analyze fewer orders, post
    // fewer deals/posts, accept the fewest brand campaigns). The two remaining
    // desktop-only metrics stay 0 so the front-end (which hides any metric whose
    // total is 0) leaves them off until their desktop reporting ships.
    deals_posted: 45890,
    product_scans: 182450,
    orders_analyzed: 84320,
    campaigns_accepted: 9240,
    social_posts_published: 52870,
    creator_messaged: 0,
    benable_list_optimized: 0,
  },
  labels: {},
};

const CONFIG_KEY = "proof_metrics";

export type PublicProofMetric = {
  key: ProofMetricKey;
  label: string;
  value: number;
};

// --------------------------------------------------------------------------
// Config
// --------------------------------------------------------------------------

function coerceBaseline(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  // A generous ceiling: a baseline is a marketing number, not unbounded.
  return Math.min(Math.round(n), 1_000_000_000);
}

function coerceConfig(raw: unknown): ProofConfig {
  const v = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawBaselines = (v.baselines && typeof v.baselines === "object"
    ? v.baselines
    : {}) as Record<string, unknown>;
  const rawLabels = (v.labels && typeof v.labels === "object" ? v.labels : {}) as Record<
    string,
    unknown
  >;

  const baselines = { ...DEFAULT_PROOF_CONFIG.baselines };
  const labels: Partial<Record<ProofMetricKey, string>> = {};
  for (const def of PROOF_METRICS) {
    baselines[def.key] = coerceBaseline(rawBaselines[def.key]);
    const label = rawLabels[def.key];
    if (typeof label === "string" && label.trim()) {
      labels[def.key] = label.trim().slice(0, 60);
    }
  }

  return {
    enabled: v.enabled !== false,
    baselines,
    labels,
  };
}

export async function readProofConfig(): Promise<ProofConfig> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    if (error || !data) return DEFAULT_PROOF_CONFIG;
    return coerceConfig((data as { value?: unknown }).value);
  } catch {
    return DEFAULT_PROOF_CONFIG;
  }
}

export async function writeProofConfig(
  next: ProofConfig,
  updatedBy: string | null,
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from("app_config").upsert(
      {
        key: CONFIG_KEY,
        value: {
          enabled: next.enabled,
          baselines: next.baselines,
          labels: next.labels,
        },
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "key" },
    );
    if (error) {
      console.error("writeProofConfig: upsert failed", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("writeProofConfig threw", err);
    return false;
  }
}

// --------------------------------------------------------------------------
// Live counts (best-effort)
// --------------------------------------------------------------------------

type AdminClient = ReturnType<typeof createAdminClient>;

/**
 * The genuine live count for one metric, before the baseline is added. Returns
 * 0 on any error (including a not-yet-applied migration), so a single broken
 * source never sinks the whole counter.
 */
async function liveCount(admin: AdminClient, source: ProofSource): Promise<number> {
  try {
    if (source.kind === "table_count") {
      const { count, error } = await admin
        .from(source.table)
        .select("id", { count: "exact", head: true });
      if (error) {
        if (!isMissingTableError(error)) {
          console.error(`proof-metrics: count(${source.table}) failed`, error);
        }
        return 0;
      }
      return count ?? 0;
    }
    // events_total: read the pre-aggregated view for this metric.
    const { data, error } = await admin
      .from("client_action_totals")
      .select("total")
      .eq("metric", source.metric)
      .maybeSingle();
    if (error) {
      if (!isMissingTableError(error)) {
        console.error(`proof-metrics: total(${source.metric}) failed`, error);
      }
      return 0;
    }
    const total = Number((data as { total?: unknown } | null)?.total ?? 0);
    return Number.isFinite(total) && total > 0 ? Math.round(total) : 0;
  } catch (err) {
    console.error("proof-metrics: liveCount threw", err);
    return 0;
  }
}

/**
 * Aggregate value (live count + baseline) for each configured metric. Exported
 * for tests: pure given the config and the per-source counts.
 */
export function composeProofMetrics(
  config: ProofConfig,
  liveCounts: Record<ProofMetricKey, number>,
): PublicProofMetric[] {
  return PROOF_METRICS.map((def) => ({
    key: def.key,
    label: config.labels[def.key] ?? def.defaultLabel,
    value: (liveCounts[def.key] ?? 0) + (config.baselines[def.key] ?? 0),
  }));
}

/**
 * Public payload for the marketing-site counter: aggregate numbers only.
 * Returns { enabled: false, metrics: [] } when the feature is switched off,
 * and best-effort zero-or-baseline values when the migration is not yet applied.
 */
export async function getPublicProofNumbers(): Promise<{
  enabled: boolean;
  metrics: PublicProofMetric[];
}> {
  const config = await readProofConfig();
  if (!config.enabled) return { enabled: false, metrics: [] };

  // A zero live-count for every registered metric, built from the registry so a
  // newly added metric can never be silently dropped.
  const zeroCounts = (): Record<ProofMetricKey, number> => {
    const out = {} as Record<ProofMetricKey, number>;
    for (const def of PROOF_METRICS) out[def.key] = 0;
    return out;
  };

  let admin: AdminClient;
  try {
    admin = createAdminClient();
  } catch {
    // No service-role key configured: show baselines only rather than erroring.
    return { enabled: true, metrics: composeProofMetrics(config, zeroCounts()) };
  }

  const counts = await Promise.all(PROOF_METRICS.map((def) => liveCount(admin, def.source)));
  const liveCounts = zeroCounts();
  PROOF_METRICS.forEach((def, i) => {
    liveCounts[def.key] = counts[i];
  });

  return { enabled: true, metrics: composeProofMetrics(config, liveCounts) };
}
