// Finance section settings, stored as one JSONB blob at app_config key
// "finance" and merged over defaults on read. Every number here is a PLANNING
// parameter the owner can tune from the Settings tab; nothing is presented as
// exact accounting.

import type { SupabaseClient } from "@supabase/supabase-js";

export type FinanceTaxMode = "passthrough" | "scorp";

export type FinanceSettings = {
  /** Lemon Squeezy MoR fee percent applied to (total - tax). Estimate. */
  lsFeePercent: number;
  /** Lemon Squeezy fixed fee per order, in cents. Estimate. */
  lsFeeFixedCents: number;
  /** Day of month LS typically sends the payout (their schedule may change). */
  lsPayoutDayOfMonth: number;
  /** Orders must be at least this many days old to be included in a payout. */
  lsPayoutNetDelayDays: number;
  /** Earned revenue is only "releasable" once past this refund window. */
  refundHoldDays: number;
  /** How the LLC is taxed. Drives the set-aside math in finance-tax.ts. */
  taxMode: FinanceTaxMode;
  /** Effective federal income tax rate on net profit (passthrough mode). */
  federalRatePercent: number;
  /** Utah flat individual income tax rate. */
  utahRatePercent: number;
  /** Self-employment tax rate (passthrough mode). */
  seTaxRatePercent: number;
  /** Portion of net profit subject to SE tax (IRS uses 92.35%). */
  seTaxBasePercent: number;
  /** Effective rate set aside on distributions in scorp mode. */
  scorpDistributionRatePercent: number;
  /** Optional PayPal sender fee added per affiliate payout, in cents. */
  paypalSenderFeePerPayoutCents: number;
};

export const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  lsFeePercent: 5,
  lsFeeFixedCents: 50,
  lsPayoutDayOfMonth: 10,
  lsPayoutNetDelayDays: 14,
  refundHoldDays: 30,
  taxMode: "passthrough",
  federalRatePercent: 22,
  utahRatePercent: 4.55,
  seTaxRatePercent: 15.3,
  seTaxBasePercent: 92.35,
  scorpDistributionRatePercent: 20,
  paypalSenderFeePerPayoutCents: 0,
};

const CONFIG_KEY = "finance";

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Merge an arbitrary stored/patch object over the defaults, clamped sane. */
export function normalizeFinanceSettings(raw: unknown): FinanceSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_FINANCE_SETTINGS;
  return {
    lsFeePercent: clampNumber(r.lsFeePercent, d.lsFeePercent, 0, 50),
    lsFeeFixedCents: Math.round(clampNumber(r.lsFeeFixedCents, d.lsFeeFixedCents, 0, 1000)),
    lsPayoutDayOfMonth: Math.round(clampNumber(r.lsPayoutDayOfMonth, d.lsPayoutDayOfMonth, 1, 28)),
    lsPayoutNetDelayDays: Math.round(
      clampNumber(r.lsPayoutNetDelayDays, d.lsPayoutNetDelayDays, 0, 90),
    ),
    refundHoldDays: Math.round(clampNumber(r.refundHoldDays, d.refundHoldDays, 0, 120)),
    taxMode: r.taxMode === "scorp" ? "scorp" : "passthrough",
    federalRatePercent: clampNumber(r.federalRatePercent, d.federalRatePercent, 0, 60),
    utahRatePercent: clampNumber(r.utahRatePercent, d.utahRatePercent, 0, 20),
    seTaxRatePercent: clampNumber(r.seTaxRatePercent, d.seTaxRatePercent, 0, 30),
    seTaxBasePercent: clampNumber(r.seTaxBasePercent, d.seTaxBasePercent, 0, 100),
    scorpDistributionRatePercent: clampNumber(
      r.scorpDistributionRatePercent,
      d.scorpDistributionRatePercent,
      0,
      60,
    ),
    paypalSenderFeePerPayoutCents: Math.round(
      clampNumber(r.paypalSenderFeePerPayoutCents, d.paypalSenderFeePerPayoutCents, 0, 10000),
    ),
  };
}

export async function loadFinanceSettings(supabase: SupabaseClient): Promise<FinanceSettings> {
  try {
    const { data } = await supabase
      .from("app_config")
      .select("value")
      .eq("key", CONFIG_KEY)
      .maybeSingle();
    return normalizeFinanceSettings(data?.value);
  } catch (error) {
    console.error("loadFinanceSettings failed, using defaults", error);
    return { ...DEFAULT_FINANCE_SETTINGS };
  }
}

export async function saveFinanceSettings(
  supabase: SupabaseClient,
  patch: Partial<FinanceSettings>,
  updatedBy: string,
): Promise<FinanceSettings> {
  const current = await loadFinanceSettings(supabase);
  const next = normalizeFinanceSettings({ ...current, ...patch });
  const { error } = await supabase.from("app_config").upsert(
    {
      key: CONFIG_KEY,
      value: next,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" },
  );
  if (error) throw new Error(`saveFinanceSettings failed: ${JSON.stringify(error)}`);
  return next;
}
