import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { lsApi, fetchLicenseFromLs, resolveAnnualVariantForMonthly } from "@/lib/lemonsqueezy";
import { hashLicenseKey } from "@/lib/license-auth";

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

type LicenseKey = {
  key: string;
  status: string;
  activation_limit: number | null;
  activations_count: number | null;
};

type LicenseKeyRow = {
  key?: string | null;
  status?: string | null;
  activation_limit?: number | null;
  activations_count?: number | null;
};

function toLicenseKey(row: LicenseKeyRow | null | undefined): LicenseKey | null {
  if (!row || !row.key) return null;
  return {
    key: row.key,
    status: row.status ?? "active",
    activation_limit: row.activation_limit ?? null,
    activations_count: row.activations_count ?? null,
  };
}

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

type AdminClient = ReturnType<typeof createAdminClient>;

async function readLocalLicense(
  admin: AdminClient,
  column: "subscription_id" | "user_id",
  value: string,
): Promise<LicenseKey | null> {
  const { data: keys } = await admin
    .from("license_keys")
    .select("key,status,activation_limit,activations_count")
    .eq(column, value)
    .limit(1);
  return toLicenseKey(keys && keys.length > 0 ? (keys[0] as LicenseKeyRow) : null);
}

/**
 * Resolves the user's license, trying local rows first (by subscription_id,
 * then by user_id to cover the race where the row exists but its
 * subscription_id is still null), then falling back to the Lemon Squeezy API.
 * When LS is the source, best-effort backfills the local table so subsequent
 * loads are fast and the desktop app can authenticate by key_hash.
 */
async function resolveLicenseKey(
  admin: AdminClient,
  opts: { subscriptionId: string | null; userId: string; email: string | null },
): Promise<LicenseKey | null> {
  if (opts.subscriptionId) {
    const local = await readLocalLicense(admin, "subscription_id", opts.subscriptionId);
    if (local) return local;
  }

  const byUser = await readLocalLicense(admin, "user_id", opts.userId);
  if (byUser) return byUser;

  if (!opts.email) return null;

  const lsLicense = await fetchLicenseFromLs(opts.email);
  if (!lsLicense) return null;

  // Best-effort backfill: never let a write failure break the read.
  try {
    await admin.from("license_keys").upsert(
      {
        ls_license_key_id: lsLicense.lsLicenseKeyId,
        user_id: opts.userId,
        subscription_id: opts.subscriptionId,
        key: lsLicense.key,
        key_hash: hashLicenseKey(lsLicense.key),
        status: lsLicense.status,
        activation_limit: lsLicense.activationLimit,
      },
      { onConflict: "ls_license_key_id" },
    );
  } catch (error) {
    console.error("subscription-details: license backfill failed", error);
  }

  return {
    key: lsLicense.key,
    status: lsLicense.status,
    activation_limit: lsLicense.activationLimit,
    activations_count: lsLicense.activationsCount,
  };
}

/**
 * True when the subscription is a billable monthly plan that can be swapped to
 * the same tier's annual variant. Env-var-based variant resolution only works
 * server-side, so this is computed here and returned to the client.
 */
function canUpgradeToAnnual(subscription: Subscription | null): boolean {
  if (!subscription) return false;
  if (subscription.status !== "active" && subscription.status !== "on_trial") {
    return false;
  }
  return resolveAnnualVariantForMonthly(subscription.ls_variant_id) != null;
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

    const licenseKey = await resolveLicenseKey(admin, {
      subscriptionId: subscription.id,
      userId: user.id,
      email: user.email ?? null,
    });

    return NextResponse.json({
      subscription,
      hasLicenseKey: Boolean(licenseKey),
      licenseKey,
      canUpgradeToAnnual: canUpgradeToAnnual(subscription),
    });
  }

  // Fallback: resolve directly from Lemon Squeezy by email.
  const email = user.email ?? null;
  const subscription = email ? await fetchSubscriptionFromLs(email) : null;

  let licenseKey: LicenseKey | null = null;
  if (subscription) {
    licenseKey = await resolveLicenseKey(admin, {
      subscriptionId: null,
      userId: user.id,
      email,
    });
  }

  return NextResponse.json({
    subscription,
    hasLicenseKey: Boolean(licenseKey),
    licenseKey,
    canUpgradeToAnnual: canUpgradeToAnnual(subscription),
  });
}
