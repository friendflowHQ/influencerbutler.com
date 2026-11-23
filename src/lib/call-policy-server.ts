// Database lookups behind src/lib/call-policy.ts. Kept apart so the policy
// itself stays a pure, unit-tested module.

import type { SupabaseClient } from "@supabase/supabase-js";
import { tierForSubscriptionStatus } from "@/lib/entitlements";
import { planForVariantId } from "@/lib/lemonsqueezy";
import { utcMonthBounds } from "@/lib/call-policy";

/**
 * Canonical plan string of the customer's latest paid or trial subscription, or
 * null when they have none (free tier) or the variant is unknown (comps, dev).
 */
export async function planForCalls(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data: sub } = await db
    .from("subscriptions").select("status,ls_variant_id").eq("user_id", userId)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (tierForSubscriptionStatus((sub?.status as string) ?? null) === "free") return null;
  return planForVariantId((sub?.ls_variant_id as string | number | null | undefined) ?? null);
}

/**
 * Non-cancelled Priority 1:1 bookings the customer already has in the UTC
 * calendar month containing `instantMs`. Fails open (0): a lookup error must
 * not lock out a paying customer.
 */
export async function supportBookingsInMonth(db: SupabaseClient, userId: string, instantMs: number): Promise<number> {
  const { fromIso, toIso } = utcMonthBounds(instantMs);
  const { count, error } = await db
    .from("call_bookings").select("id", { count: "exact", head: true })
    .eq("user_id", userId).eq("call_type", "support").neq("status", "cancelled")
    .gte("starts_at", fromIso).lt("starts_at", toIso);
  if (error) {
    console.error("[call-policy] monthly count", error.message);
    return 0;
  }
  return count ?? 0;
}
