import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Resolves the signed-in user's subscription for the dashboard.
 *
 * Reads the subscriptions table with the service-role client (bypasses RLS),
 * and if nothing is found falls back to email -> Lemon Squeezy directly. This
 * mirrors the billing history route and makes the dashboard resilient to:
 *   - subscriptions RLS having no SELECT policy (anon read returns nothing),
 *   - a row whose user_id doesn't match the logged-in account,
 *   - the subscription_created webhook not having landed a row yet.
 */

const VISIBLE_STATUSES = ["active", "on_trial", "past_due", "cancelled"];

type Subscription = {
  id: string | null;
  ls_subscription_id: string;
  ls_variant_id: string | number | null;
  status: string;
  plan_name: string | null;
  renews_at: string | null;
  ends_at: string | null;
};

type SubscriptionRow = {
  id?: string | null;
  ls_subscription_id?: string | number | null;
  ls_variant_id?: string | number | null;
  status?: string | null;
  plan_name?: string | null;
  renews_at?: string | null;
  ends_at?: string | null;
};

type LsSubscriptionAttributes = {
  status?: string | null;
  product_name?: string | null;
  variant_name?: string | null;
  product_id?: string | number | null;
  variant_id?: string | number | null;
  renews_at?: string | null;
  ends_at?: string | null;
  created_at?: string | null;
};

type LsSubscription = {
  id?: string;
  attributes?: LsSubscriptionAttributes;
};

function rankStatus(status: string | null | undefined): number {
  switch (status) {
    case "active":
      return 0;
    case "on_trial":
      return 1;
    case "past_due":
      return 2;
    case "cancelled":
      return 3;
    default:
      return 4;
  }
}

/**
 * Picks the most relevant LS subscription: prefer active/on_trial over
 * past_due/cancelled, breaking ties by most recently created.
 */
function pickBestLsSubscription(subs: LsSubscription[]): LsSubscription | null {
  let best: LsSubscription | null = null;
  for (const sub of subs) {
    if (!sub.id) continue;
    if (!best) {
      best = sub;
      continue;
    }
    const a = sub.attributes ?? {};
    const b = best.attributes ?? {};
    const rankDiff = rankStatus(a.status) - rankStatus(b.status);
    if (rankDiff < 0) {
      best = sub;
    } else if (rankDiff === 0) {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (ta > tb) best = sub;
    }
  }
  return best;
}

async function fetchSubscriptionFromLs(email: string): Promise<Subscription | null> {
  const params = new URLSearchParams();
  params.set("filter[user_email]", email);
  params.set("page[size]", "50");

  const response = await lsApi(`/subscriptions?${params.toString()}`, { method: "GET" });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error("subscription-details: LS subscriptions lookup failed", {
      status: response.status,
      text: text.slice(0, 500),
    });
    return null;
  }

  const payload = (await response.json()) as { data?: LsSubscription[] };
  const best = pickBestLsSubscription(payload.data ?? []);
  if (!best?.id) return null;

  const a = best.attributes ?? {};
  return {
    id: null,
    ls_subscription_id: best.id,
    ls_variant_id: a.variant_id ?? null,
    status: a.status ?? "active",
    plan_name: a.product_name ?? a.variant_name ?? null,
    renews_at: a.renews_at ?? null,
    ends_at: a.ends_at ?? null,
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = userData.user;
  const admin = createAdminClient();

  // Primary: service-role read by user_id (bypasses RLS).
  const { data: subs } = await admin
    .from("subscriptions")
    .select("id,ls_subscription_id,ls_variant_id,status,plan_name,renews_at,ends_at")
    .eq("user_id", user.id)
    .in("status", VISIBLE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1);

  const row = (subs && subs.length > 0 ? subs[0] : null) as SubscriptionRow | null;

  if (row && row.ls_subscription_id != null) {
    const subscription: Subscription = {
      id: row.id ?? null,
      ls_subscription_id: String(row.ls_subscription_id),
      ls_variant_id: row.ls_variant_id ?? null,
      status: row.status ?? "active",
      plan_name: row.plan_name ?? null,
      renews_at: row.renews_at ?? null,
      ends_at: row.ends_at ?? null,
    };

    let hasLicenseKey = false;
    if (subscription.id) {
      const { data: keys } = await admin
        .from("license_keys")
        .select("id")
        .eq("subscription_id", subscription.id)
        .limit(1);
      hasLicenseKey = Boolean(keys && keys.length > 0);
    }

    return NextResponse.json({ subscription, hasLicenseKey });
  }

  // Fallback: resolve directly from Lemon Squeezy by email.
  const email = user.email ?? null;
  const subscription = email ? await fetchSubscriptionFromLs(email) : null;

  let hasLicenseKey = false;
  if (subscription) {
    const { data: keys } = await admin
      .from("license_keys")
      .select("id")
      .eq("user_id", user.id)
      .limit(1);
    hasLicenseKey = Boolean(keys && keys.length > 0);
  }

  return NextResponse.json({ subscription, hasLicenseKey });
}
