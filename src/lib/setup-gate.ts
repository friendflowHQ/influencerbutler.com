// 1:1 calls need a finished in-app setup.
//
// Owner decision (2026-11-16): customers who skip the desktop setup
// walkthrough arrive at their call with nothing connected, and the call turns
// into hours of setup. So a customer whose walkthrough outcome is "skipped"
// is asked to finish setup before booking a Priority 1:1 or Setup call.
//
// The outcome comes from the desktop walkthrough's onboarding profile
// (email_subscribers.onboarding_profile, or its wt-done-* tag when that column
// is missing in prod), sent through the licensing Worker. Finishing the
// walkthrough later sends outcome "complete", which replaces "skipped" and
// unlocks booking with no manual step.
//
// Deliberately narrow: only a recorded "skipped" blocks. No record, an older
// install, a lookup error or a missing table all let the booking through, so
// this can never lock out a customer we know nothing about.

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseOnboardingProfile, profileFromTags } from "@/lib/onboarding-profile";
import { normalizeFunnelEmail } from "@/lib/funnel-assignments";

export const SETUP_REQUIRED_CODE = "setup_required";

export const SETUP_REQUIRED_MESSAGE =
  "Before your 1:1 call, please finish the quick setup in the Influencer Butler app. " +
  "It connects your Butlers, so we can spend the call on your goals instead of on setup. " +
  "In the app, open Settings, find First-run walkthrough, and press Resume where you left off. " +
  "Once you finish, come back here and every open time will be available. " +
  "Stuck on a step right now? The AI Concierge can help 24/7.";

/** Pure: true only when the stored row clearly says the walkthrough was skipped. */
export function rowSaysSetupSkipped(row: { onboarding_profile?: unknown; tags?: unknown } | null | undefined): boolean {
  if (!row) return false;
  const fromColumn = parseOnboardingProfile(row.onboarding_profile);
  if (fromColumn?.outcome) return fromColumn.outcome === "skipped";
  const tags = Array.isArray(row.tags) ? (row.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
  return profileFromTags(tags)?.outcome === "skipped";
}

/** True when this customer skipped the in-app setup. Fails open (false) on any error. */
export async function setupWalkthroughSkipped(db: SupabaseClient, rawEmail: string | null | undefined): Promise<boolean> {
  const email = normalizeFunnelEmail(rawEmail);
  if (!email) return false;
  try {
    let res = await db
      .from("email_subscribers")
      .select("tags,onboarding_profile")
      .eq("email", email)
      .maybeSingle();
    // Prod can lag the funnels v2 migration: retry with tags only.
    if (res.error) {
      res = await db.from("email_subscribers").select("tags").eq("email", email).maybeSingle();
      if (res.error) return false;
    }
    return rowSaysSetupSkipped(res.data as { onboarding_profile?: unknown; tags?: unknown } | null);
  } catch {
    return false;
  }
}
