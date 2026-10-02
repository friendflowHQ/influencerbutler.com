// Weekly company valuation snapshot, shown on the Finance dashboard's
// Valuation tab (src/app/dashboard/admin/finance/ValuationTab.tsx).
//
// Deliberately simple and honest, same spirit as growth-forecast.ts: current
// ARR (active subscriptions x each one's monthly-equivalent price) times a
// revenue-multiple range. Not a formal valuation - a rough internal estimate
// for tracking trend over time.
//
// computeValuationSnapshot() is the single source of truth, called by both
// the weekly cron route (src/app/api/cron/valuation/route.ts) and the
// manual-recompute admin route (src/app/api/admin/finance/valuation/recompute/route.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { planForVariantId } from "@/lib/lemonsqueezy";
import { planMetaFor } from "@/lib/pricing-constants";
import { DEFAULT_TIMEZONE, localParts, localDateStr, zonedTimeToUtc } from "@/lib/timezone";
import { deriveMonthlyGrowth } from "@/lib/growth-forecast";

/**
 * Revenue-multiple range for the estimate: a profitable, founder-run SaaS
 * without outside funding typically trades at roughly 2x-4x trailing ARR.
 * Tune these as the business matures; they are the only "opinion" in this
 * file, everything else is arithmetic on real data.
 */
export const MULTIPLE_LOW = 2;
export const MULTIPLE_BASE = 3;
export const MULTIPLE_HIGH = 4;

const ROW_LIMIT = 10000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type ValuationSnapshot = {
  snapshotDate: string; // "YYYY-MM-DD", the Monday this snapshot represents
  activeSubscriptions: number;
  mrrCents: number;
  arrCents: number;
  monthlyGrowthRate: number | null;
  multipleLow: number;
  multipleBase: number;
  multipleHigh: number;
  valuationLowCents: number;
  valuationBaseCents: number;
  valuationHighCents: number;
  inputs: Record<string, unknown>;
};

/** The most recent Monday on/before `date`, as local midnight in `tz`. */
export function mostRecentMonday(date: Date, tz: string = DEFAULT_TIMEZONE): Date {
  const { year, month, day } = localParts(date, tz);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun..6=Sat
  const sinceMonday = (weekday + 6) % 7; // Mon=0 ... Sun=6
  const monday = new Date(Date.UTC(year, month - 1, day - sinceMonday));
  return zonedTimeToUtc(
    monday.getUTCFullYear(),
    monday.getUTCMonth() + 1,
    monday.getUTCDate(),
    0,
    tz,
  );
}

function isAddonVariant(variantId: string | null | undefined): boolean {
  const addon = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON ?? "";
  return addon !== "" && String(variantId ?? "") === addon;
}

/**
 * Best-effort point-in-time active-subscriber list as of `asOf`. The
 * `subscriptions.status` column only reflects *current* status, so a past
 * date is reconstructed from timestamp columns instead: a subscription
 * counts as active on `asOf` when it had already started
 * (`created_at <= asOf`) and had not yet lost access (`ends_at is null or
 * ends_at > asOf`). This slightly over-counts a subscription that was
 * cancelled-but-still-billing on that date (`ends_at` is the access end, not
 * the cancel date) - the right call for a valuation, since that customer was
 * still paying. Returns null on query failure so the caller can degrade
 * rather than crash.
 */
async function activeSubscriptionsAsOf(
  supabase: SupabaseClient,
  asOf: Date,
): Promise<{ ls_variant_id: string | null }[] | null> {
  const asOfIso = asOf.toISOString();
  const { data, error } = await supabase
    .from("subscriptions")
    .select("ls_variant_id,created_at,ends_at")
    .lte("created_at", asOfIso)
    .or(`ends_at.is.null,ends_at.gt.${asOfIso}`)
    .limit(ROW_LIMIT);
  if (error) {
    console.error("valuation: active-subscriptions query failed", error);
    return null;
  }
  return ((data ?? []) as { ls_variant_id: string | null }[]).filter(
    (row) => !isAddonVariant(row.ls_variant_id),
  );
}

/** A plan's list price normalized to a monthly figure (annual plans / 12). */
function monthlyEquivalentCents(variantId: string | null): number {
  const meta = planMetaFor(planForVariantId(variantId));
  if (!meta) return 0;
  return meta.interval === "year" ? Math.round(meta.priceCents / 12) : meta.priceCents;
}

/**
 * Computes the valuation snapshot for the week containing `asOf` (snapped to
 * that week's Monday). Returns null when the underlying query fails, so
 * callers can skip the write rather than store a bogus zeroed-out row.
 */
export async function computeValuationSnapshot(
  supabase: SupabaseClient,
  asOf: Date,
): Promise<ValuationSnapshot | null> {
  const monday = mostRecentMonday(asOf);
  const snapshotDate = localDateStr(monday, DEFAULT_TIMEZONE);

  const current = await activeSubscriptionsAsOf(supabase, monday);
  if (!current) return null;

  const mrrCents = current.reduce(
    (sum, row) => sum + monthlyEquivalentCents(row.ls_variant_id),
    0,
  );
  const arrCents = mrrCents * 12;
  const activeSubscriptions = current.length;

  // Growth: active-subscriber count 4 weeks earlier vs. now, treated as an
  // approximate one-month step - same CAGR math the Growth forecast uses
  // (deriveMonthlyGrowth), just fed two hand-picked points instead of a
  // monthly series. Best-effort: a failed or empty prior window just means
  // "unknown", not zero growth.
  const fourWeeksAgo = new Date(monday.getTime() - 4 * WEEK_MS);
  const prior = await activeSubscriptionsAsOf(supabase, fourWeeksAgo);
  const monthlyGrowthRate =
    prior && prior.length > 0
      ? deriveMonthlyGrowth([prior.length, activeSubscriptions])
      : null;

  return {
    snapshotDate,
    activeSubscriptions,
    mrrCents,
    arrCents,
    monthlyGrowthRate,
    multipleLow: MULTIPLE_LOW,
    multipleBase: MULTIPLE_BASE,
    multipleHigh: MULTIPLE_HIGH,
    valuationLowCents: Math.round(arrCents * MULTIPLE_LOW),
    valuationBaseCents: Math.round(arrCents * MULTIPLE_BASE),
    valuationHighCents: Math.round(arrCents * MULTIPLE_HIGH),
    inputs: {
      asOf: asOf.toISOString(),
      monday: monday.toISOString(),
      activeSubscriptionsFourWeeksAgo: prior ? prior.length : null,
    },
  };
}

export async function upsertValuationSnapshot(
  supabase: SupabaseClient,
  snapshot: ValuationSnapshot,
): Promise<{ ok: boolean; error?: string; errorCode?: string }> {
  const { error } = await supabase.from("valuation_snapshots").upsert(
    {
      snapshot_date: snapshot.snapshotDate,
      active_subscriptions: snapshot.activeSubscriptions,
      mrr_cents: snapshot.mrrCents,
      arr_cents: snapshot.arrCents,
      monthly_growth_rate: snapshot.monthlyGrowthRate,
      multiple_low: snapshot.multipleLow,
      multiple_base: snapshot.multipleBase,
      multiple_high: snapshot.multipleHigh,
      valuation_low_cents: snapshot.valuationLowCents,
      valuation_base_cents: snapshot.valuationBaseCents,
      valuation_high_cents: snapshot.valuationHighCents,
      inputs: snapshot.inputs,
    },
    { onConflict: "snapshot_date" },
  );
  if (error) {
    console.error("valuation: upsert failed", error);
    return { ok: false, error: error.message, errorCode: error.code };
  }
  return { ok: true };
}
