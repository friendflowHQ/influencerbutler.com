import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { compGrantsForUser, isCompSubscriptionId } from "@/lib/comp-conversion";
import { CUSTOMER_NOTICE_KINDS, keepPlanUrl } from "@/lib/comp-expiry-customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * GET /api/me/comp-status - for the dashboard CompEndingBanner.
 *
 * Returns the signed-in user's running win-back / creator comp (free access),
 * when it ends, and the one-click Keep-my-plan link. `active:false` when they
 * have no such comp, it already converted, or they also have a paid plan.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();
  if (error || !userData.user) return NextResponse.json({ active: false }, { status: 401 });
  const userId = userData.user.id;

  try {
    const admin = createAdminClient();
    const grants = await compGrantsForUser(admin, userId);
    if (grants.length === 0) return NextResponse.json({ active: false });

    // Converted / cancelled state lives on the grant row; read it directly.
    const { data: rows } = await admin
      .from("comp_grants")
      .select("ls_subscription_id,expires_at,cancelled_at,converted_at,kind")
      .eq("user_id", userId)
      .limit(50);
    const now = Date.now();
    const open = ((rows ?? []) as Record<string, unknown>[])
      .filter((r) => !r.cancelled_at && !r.converted_at)
      .filter((r) => typeof r.kind === "string" && CUSTOMER_NOTICE_KINDS.has(r.kind))
      .filter((r) => typeof r.expires_at === "string" && new Date(r.expires_at).getTime() > now)
      .sort((a, b) => new Date(a.expires_at as string).getTime() - new Date(b.expires_at as string).getTime());
    const grant = open[0];
    if (!grant) return NextResponse.json({ active: false });

    // A paid plan alongside the comp means there is nothing to keep.
    const grantIds = new Set(grants.map((g) => g.lsSubscriptionId));
    const { data: live } = await admin
      .from("subscriptions")
      .select("ls_subscription_id,status")
      .eq("user_id", userId)
      .in("status", ["active", "on_trial", "past_due"]);
    const livePaid = ((live ?? []) as { ls_subscription_id?: string | null }[]).some(
      (s) => !isCompSubscriptionId(s.ls_subscription_id ?? null, grantIds),
    );
    if (livePaid) return NextResponse.json({ active: false });

    const compId = grant.ls_subscription_id as string;
    const endsAt = grant.expires_at as string;
    const { data: sub } = await admin
      .from("subscriptions")
      .select("plan_name")
      .eq("ls_subscription_id", compId)
      .maybeSingle();
    const planRaw = (sub as { plan_name?: string | null } | null)?.plan_name ?? null;
    return NextResponse.json({
      active: true,
      kind: grant.kind,
      endsAt,
      daysLeft: Math.max(0, Math.ceil((new Date(endsAt).getTime() - now) / DAY_MS)),
      plan: planRaw ? planRaw.replace(/\s*\(comp\)\s*$/i, "") : "Pro",
      keepUrl: keepPlanUrl(compId, "dashboard"),
    });
  } catch (err) {
    // The kind / converted_at columns come from 20261108; before it is applied
    // this simply reports no banner.
    console.error("comp-status: lookup failed", err);
    return NextResponse.json({ active: false });
  }
}
