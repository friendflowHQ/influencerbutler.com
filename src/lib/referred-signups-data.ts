import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveReferredSignups,
  type ReferredEvent,
  type ReferredFunnel,
  type ReferredProfileRow,
  type ReferredSubscriptionRow,
} from "@/lib/referred-signups";

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
): Promise<{ migrationPending: boolean; funnel: ReferredFunnel; events: ReferredEvent[] }> {
  let migrationPending = false;

  let profileRows: ReferredProfileRow[] = [];
  const { data: signupData, error: signupErr } = await admin
    .from("profiles")
    .select("created_at,ref_captured_at")
    .eq("ref_affiliate_user_id", affiliateUserId)
    .order("ref_captured_at", { ascending: false })
    .limit(200);
  if (signupErr) {
    // Most likely the ref_* columns don't exist in prod yet.
    console.warn("referred-signups: signups read skipped", signupErr);
    migrationPending = true;
  } else {
    profileRows = (signupData ?? []) as ReferredProfileRow[];
  }

  let subRows: ReferredSubscriptionRow[] = [];
  const { data: subData, error: subErr } = await admin
    .from("subscriptions")
    .select("user_id,status,trial_started_at,trial_converted_at,pro_started_at,ends_at")
    .eq("ref_affiliate_user_id", affiliateUserId)
    .limit(200);
  if (subErr) {
    // Prod lagged 20260618_pro_welcome_funnel for a while, so pro_started_at
    // may not exist yet. Retry without it rather than losing the whole
    // trial/paid funnel; the derivation infers direct-Pro buys from status.
    console.warn("referred-signups: full subscriptions read failed, retrying reduced", subErr);
    const { data: reducedData, error: reducedErr } = await admin
      .from("subscriptions")
      .select("user_id,status,trial_started_at,trial_converted_at,ends_at")
      .eq("ref_affiliate_user_id", affiliateUserId)
      .limit(200);
    if (reducedErr) {
      console.warn("referred-signups: subscriptions read skipped", reducedErr);
    } else {
      subRows = ((reducedData ?? []) as Omit<ReferredSubscriptionRow, "pro_started_at">[]).map(
        (row) => ({ ...row, pro_started_at: null }),
      );
    }
  } else {
    subRows = (subData ?? []) as ReferredSubscriptionRow[];
  }

  const { funnel, events } = deriveReferredSignups(profileRows, subRows);
  return { migrationPending, funnel, events };
}
