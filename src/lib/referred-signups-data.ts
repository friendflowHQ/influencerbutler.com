import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveReferredSignups,
  type CompMakeWholeEntry,
  type ReferredEvent,
  type ReferredFunnel,
  type ReferredInsights,
  type ReferredProfileRow,
  type ReferredSubscriptionRow,
} from "@/lib/referred-signups";
import { billingIntervalForVariantId } from "@/lib/lemonsqueezy";

/**
 * Loads the "Referred signups" funnel for one affiliate, using an already
 * trusted admin (service-role) client. Shared by the affiliate's own endpoint
 * (/api/affiliates/referred-signups) and the admin "view as" endpoint
 * (/api/affiliates/admin-affiliate-referred-signups) so both stay identical.
 *
 * Reads MUST use the admin client: subscriptions has RLS with no SELECT
 * policy, and the profiles rows here belong to OTHER users. Degrades to
 * migrationPending when the 20260719 profiles columns are absent, and retries
 * subscriptions without pro_started_at when prod lags 20260618.
 */
export async function loadReferredSignups(
  admin: SupabaseClient,
  affiliateUserId: string,
): Promise<{
  migrationPending: boolean;
  funnel: ReferredFunnel;
  events: ReferredEvent[];
  insights: ReferredInsights;
}> {
  let migrationPending = false;

  // Attach the billing cadence (from ls_variant_id) so the funnel can report a
  // plan mix. Tolerates the reduced (no pro_started_at) shape from the retry.
  const withInterval = (rows: Record<string, unknown>[]): ReferredSubscriptionRow[] =>
    rows.map((r) => ({
      user_id: (r.user_id as string | null) ?? null,
      status: (r.status as string | null) ?? null,
      trial_started_at: (r.trial_started_at as string | null) ?? null,
      trial_converted_at: (r.trial_converted_at as string | null) ?? null,
      pro_started_at: (r.pro_started_at as string | null) ?? null,
      ends_at: (r.ends_at as string | null) ?? null,
      billing_interval: billingIntervalForVariantId(
        (r.ls_variant_id as string | number | null) ?? null,
      ),
    }));

  // id + ref_channel let the derivation attach a lead source (web/extension/
  // desktop) to each event. id is used only to join a channel onto this
  // account's subscription events; it is never returned to the client.
  const toProfileRows = (rows: Record<string, unknown>[]): ReferredProfileRow[] =>
    rows.map((r) => ({
      created_at: (r.created_at as string | null) ?? null,
      ref_captured_at: (r.ref_captured_at as string | null) ?? null,
      user_id: (r.id as string | null) ?? null,
      ref_channel: (r.ref_channel as ReferredProfileRow["ref_channel"]) ?? null,
    }));

  let profileRows: ReferredProfileRow[] = [];
  const { data: signupData, error: signupErr } = await admin
    .from("profiles")
    .select("id,ref_channel,created_at,ref_captured_at")
    .eq("ref_affiliate_user_id", affiliateUserId)
    .order("ref_captured_at", { ascending: false })
    .limit(200);
  if (signupErr) {
    // ref_channel lands after the ref_* columns (migration 20260826). Retry
    // without it so a prod that has ref_* but not ref_channel still loads;
    // those events fall back to a "web" label in the derivation.
    console.warn("referred-signups: full signups read failed, retrying reduced", signupErr);
    const { data: reducedData, error: reducedErr } = await admin
      .from("profiles")
      .select("id,created_at,ref_captured_at")
      .eq("ref_affiliate_user_id", affiliateUserId)
      .order("ref_captured_at", { ascending: false })
      .limit(200);
    if (reducedErr) {
      // Most likely the ref_* columns don't exist in prod yet.
      console.warn("referred-signups: signups read skipped", reducedErr);
      migrationPending = true;
    } else {
      profileRows = toProfileRows((reducedData ?? []) as Record<string, unknown>[]);
    }
  } else {
    profileRows = toProfileRows((signupData ?? []) as Record<string, unknown>[]);
  }

  let subRows: ReferredSubscriptionRow[] = [];
  const { data: subData, error: subErr } = await admin
    .from("subscriptions")
    .select("user_id,status,trial_started_at,trial_converted_at,pro_started_at,ends_at,ls_variant_id")
    .eq("ref_affiliate_user_id", affiliateUserId)
    .limit(200);
  if (subErr) {
    // Prod lagged 20260618_pro_welcome_funnel for a while, so pro_started_at
    // may not exist yet. Retry without it rather than losing the whole
    // trial/paid funnel; the derivation infers direct-Pro buys from status.
    console.warn("referred-signups: full subscriptions read failed, retrying reduced", subErr);
    const { data: reducedData, error: reducedErr } = await admin
      .from("subscriptions")
      .select("user_id,status,trial_started_at,trial_converted_at,ends_at,ls_variant_id")
      .eq("ref_affiliate_user_id", affiliateUserId)
      .limit(200);
    if (reducedErr) {
      console.warn("referred-signups: subscriptions read skipped", reducedErr);
    } else {
      subRows = withInterval((reducedData ?? []) as Record<string, unknown>[]);
    }
  } else {
    subRows = withInterval((subData ?? []) as Record<string, unknown>[]);
  }

  // Comp make-whole earnings owed to THIS affiliate, so the funnel's recent
  // activity can show them (a comped referral otherwise reads as just a
  // cancellation). Best-effort: the adjustments table is a manual-apply
  // migration that can lag prod, and this must never break the funnel. Only
  // DUE installments (period <= current month) are shown, matching how the owed
  // total surfaces them one month at a time.
  let compMakeWholes: CompMakeWholeEntry[] = [];
  try {
    const nowMonth = new Date().toISOString().slice(0, 7);
    const { data: adjData } = await admin
      .from("affiliate_commission_adjustments")
      .select("amount_cents,period,created_at,source")
      .eq("user_id", affiliateUserId);
    compMakeWholes = ((adjData ?? []) as Record<string, unknown>[])
      .filter((r) => (r.source as string | null) === "comp")
      .map((r) => {
        const period = typeof r.period === "string" ? r.period : null;
        const createdAt = typeof r.created_at === "string" ? r.created_at : null;
        const dueMonth = period ?? (createdAt ? createdAt.slice(0, 7) : null);
        const at = period ? `${period}-01T00:00:00.000Z` : createdAt;
        return {
          amountCents: typeof r.amount_cents === "number" ? r.amount_cents : 0,
          at,
          dueMonth,
        };
      })
      .filter((r): r is { amountCents: number; at: string; dueMonth: string | null } => Boolean(r.at))
      .filter((r) => !r.dueMonth || r.dueMonth <= nowMonth)
      .map(({ amountCents, at }) => ({ amountCents, at }));
  } catch (error) {
    console.warn("referred-signups: comp make-whole read skipped", error);
  }

  // No-card trials (/api/trial/no-card) are in-house comps, not Lemon Squeezy
  // subscriptions, so they never carry subscriptions.ref_affiliate_user_id.
  // The referral lives on the profile stamp; read those accounts' trial grants
  // and surface each as a "trial started". Appended after the LS rows so a
  // real subscription for the same user wins the per-user dedupe.
  const noCardTrials = await loadNoCardTrialRows(admin, profileRows);

  const { funnel, events, insights } = deriveReferredSignups(
    profileRows,
    [...subRows, ...noCardTrials],
    Date.now(),
    compMakeWholes,
  );
  return { migrationPending, funnel, events, insights };
}

/** Discount-code shape issueInHouseComp gives the 14-day no-card trial, used to
 *  recognize trial grants while comp_grants.kind (20261108) is not yet applied. */
const NO_CARD_TRIAL_CODE_RE = /FREE14D$/i;

/**
 * Synthetic subscription rows for referred accounts that started a no-card
 * trial: trial_started_at = when the grant was issued, no status (a free trial
 * is never "paying" or "cancelled"). Best-effort: any read error yields none.
 */
export async function loadNoCardTrialRows(
  admin: SupabaseClient,
  profiles: ReferredProfileRow[],
): Promise<ReferredSubscriptionRow[]> {
  const userIds = [
    ...new Set(profiles.map((p) => p.user_id).filter((id): id is string => Boolean(id))),
  ];
  if (userIds.length === 0) return [];

  try {
    let rows: Record<string, unknown>[] = [];
    const full = await admin
      .from("comp_grants")
      .select("user_id,issued_at,discount_code,kind")
      .in("user_id", userIds);
    if (full.error) {
      // comp_grants.kind is a hand-applied migration; fall back to the code shape.
      const reduced = await admin
        .from("comp_grants")
        .select("user_id,issued_at,discount_code")
        .in("user_id", userIds);
      if (reduced.error) {
        console.warn("referred-signups: no-card trial read skipped", reduced.error);
        return [];
      }
      rows = (reduced.data ?? []) as Record<string, unknown>[];
    } else {
      rows = (full.data ?? []) as Record<string, unknown>[];
    }
    return noCardTrialRowsFromGrants(rows);
  } catch (error) {
    console.warn("referred-signups: no-card trial read skipped", error);
    return [];
  }
}

/** Pure mapping, exported for tests. */
export function noCardTrialRowsFromGrants(
  rows: Record<string, unknown>[],
): ReferredSubscriptionRow[] {
  const out: ReferredSubscriptionRow[] = [];
  for (const r of rows) {
    const userId = typeof r.user_id === "string" ? r.user_id : null;
    const issuedAt = typeof r.issued_at === "string" ? r.issued_at : null;
    if (!userId || !issuedAt) continue;
    const kind = typeof r.kind === "string" ? r.kind : null;
    const code = typeof r.discount_code === "string" ? r.discount_code : "";
    const isTrial = kind ? kind === "trial" : NO_CARD_TRIAL_CODE_RE.test(code);
    if (!isTrial) continue;
    out.push({
      user_id: userId,
      status: null,
      trial_started_at: issuedAt,
      trial_converted_at: null,
      pro_started_at: null,
      ends_at: null,
      billing_interval: null,
    });
  }
  return out;
}
