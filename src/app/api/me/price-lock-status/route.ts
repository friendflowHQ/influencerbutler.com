import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { compGrantsForUser, isCompSubscriptionId } from "@/lib/comp-conversion";
import { keepPlanUrl } from "@/lib/comp-expiry-customer";
import { PRICE_CHANGE, priceChangeActive } from "@/lib/pricing-constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/me/price-lock-status - which price lock banner the dashboard shows
 * (until Nov 30 2026, 11:59pm Pacific):
 *
 *   "locked"  paying or on a card trial: "You're locked in at your current price"
 *   "comp"    a live comp with no card yet: "Add a card by Nov 30 ..." + keepUrl
 *   "open"    everyone else: "Prices go up Nov 30. Lock today's price forever."
 *   "none"    after the deadline (or comp already has a card): no banner
 */
export async function GET() {
  const endsAt = PRICE_CHANGE.effectiveAt;
  if (!priceChangeActive()) return NextResponse.json({ state: "none", endsAt });

  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return NextResponse.json({ state: "open", endsAt });
  const userId = userData.user.id;

  try {
    const admin = createAdminClient();
    const grants = await compGrantsForUser(admin, userId);
    const grantIds = new Set(grants.map((g) => g.lsSubscriptionId));
    const { data: live } = await admin
      .from("subscriptions")
      .select("ls_subscription_id,status")
      .eq("user_id", userId)
      .in("status", ["active", "on_trial", "past_due", "paused"]);
    const rows = (live ?? []) as { ls_subscription_id?: string | null; status?: string | null }[];
    const paidOrCardTrial = rows.some((s) => !isCompSubscriptionId(s.ls_subscription_id ?? null, grantIds));
    if (paidOrCardTrial) return NextResponse.json({ state: "locked", endsAt });

    const { data: grantRows } = await admin
      .from("comp_grants")
      .select("ls_subscription_id,expires_at,cancelled_at,converted_at,kind")
      .eq("user_id", userId)
      .limit(50);
    const now = Date.now();
    const running = ((grantRows ?? []) as Record<string, unknown>[]).filter(
      (r) => !r.cancelled_at && typeof r.expires_at === "string" && Date.parse(r.expires_at) > now,
    );
    if (running.some((r) => r.converted_at)) return NextResponse.json({ state: "none", endsAt });
    const comp = running.find((r) => r.kind !== "trial");
    if (comp && typeof comp.ls_subscription_id === "string") {
      return NextResponse.json({ state: "comp", endsAt, keepUrl: keepPlanUrl(comp.ls_subscription_id, "price-lock-banner") });
    }
    return NextResponse.json({ state: "open", endsAt });
  } catch {
    return NextResponse.json({ state: "open", endsAt });
  }
}
