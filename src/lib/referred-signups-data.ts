import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveReferredSignups,
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

  const { funnel, events, insights } = deriveReferredSignups(profileRows, subRows);
  return { migrationPending, funnel, events, insights };
}
