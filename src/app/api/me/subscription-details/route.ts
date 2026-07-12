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

function mapLsSubscription(sub: LsSubscription): Subscription | null {
  if (!sub.id) return null;
  const a = sub.attributes ?? {};
  return {
    id: null,
    ls_subscription_id: sub.id,
    ls_variant_id: a.variant_id ?? null,
    status: a.status ?? "active",
    plan_name: a.product_name ?? a.variant_name ?? null,
    renews_at: a.renews_at ?? null,
    ends_at: a.ends_at ?? null,
  };
}

/**
 * Fetches all of the user's Lemon Squeezy subscriptions by email, ordered with
 * the most relevant one first (active/on_trial before past_due/cancelled). Used
 * only as a fallback when no local subscriptions rows exist.
 */
async function fetchSubscriptionsFromLs(email: string): Promise<Subscription[]> {
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
    return [];
  }

  const payload = (await response.json()) as { data?: LsSubscription[] };
  const all = payload.data ?? [];
  const best = pickBestLsSubscription(all);
  // Surface the "best" subscription first, then the rest in their original order.
  const ordered = best
    ? [best, ...all.filter((s) => s.id !== best.id)]
    : all;
  return ordered.map(mapLsSubscription).filter((s): s is Subscription => s !== null);
}

type AdminClient = ReturnType<typeof createAdminClient>;

async function readLocalLicense(
  admin: AdminClient,
  column: "subscription_id" | "user_id",
  value: string,
): Promise<LicenseKey | null> {
  // Users with several keys (plan changes, add-ons, regrants, test orders)
  // must see their ACTIVE key, not an arbitrary row - the unordered LIMIT 1
  // here used to flip between keys across refreshes. Prefer active, then
  // newest.
  const { data: keys } = await admin
    .from("license_keys")
    .select("key,status,activation_limit,activations_count")
    .eq(column, value)
    .order("created_at", { ascending: false })
    .limit(10);
  const rows = (keys ?? []) as LicenseKeyRow[];
  const best = rows.find((k) => k.status === "active") ?? rows[0] ?? null;
  return toLicenseKey(best);
}

/**
 * Fetches every license key for the user in one query and groups them by
 * subscription_id, keeping the best (active, then newest) key per subscription.
 * Lets us assign each subscription its own key without an extra query per row.
 * Keys whose subscription_id is null are omitted (they can't be matched to a
 * specific subscription and are handled by the per-primary fallback instead).
 */
async function readLicenseKeysBySubscription(
  admin: AdminClient,
  userId: string,
): Promise<Map<string, LicenseKey>> {
  const { data: keys } = await admin
    .from("license_keys")
    .select("key,status,activation_limit,activations_count,subscription_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const rows = (keys ?? []) as (LicenseKeyRow & { subscription_id?: string | null })[];
  const bySub = new Map<string, LicenseKey>();
  // Rows are newest-first; only replace an existing entry when the new row is
  // active and the kept one is not, so we prefer active then newest.
  for (const row of rows) {
    const subId = row.subscription_id;
    if (!subId) continue;
    const mapped = toLicenseKey(row);
    if (!mapped) continue;
    const existing = bySub.get(subId);
    if (!existing) {
      bySub.set(subId, mapped);
    } else if (existing.status !== "active" && mapped.status === "active") {
      bySub.set(subId, mapped);
    }
  }
  return bySub;
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

type SubscriptionEntry = {
  subscription: Subscription;
  licenseKey: LicenseKey | null;
  hasLicenseKey: boolean;
  canUpgradeToAnnual: boolean;
};

/**
 * Serializes the response, keeping the singular top-level fields (mirroring the
 * primary/first entry) for backward compatibility with the dashboard overview
 * and license-key loaders, while adding the full `subscriptions` array that the
 * subscription management page renders.
 */
function buildResponse(entries: SubscriptionEntry[]) {
  const primary = entries[0] ?? null;
  return NextResponse.json({
    subscriptions: entries,
    // Backward-compat singular fields (primary subscription).
    subscription: primary?.subscription ?? null,
    hasLicenseKey: primary ? primary.hasLicenseKey : false,
    licenseKey: primary?.licenseKey ?? null,
    canUpgradeToAnnual: primary ? primary.canUpgradeToAnnual : false,
  });
}

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = userData.user;
  const admin = createAdminClient();

  // Primary: service-role read by user_id (bypasses RLS). A user can own several
  // subscriptions (a Pro plan plus one or more Daily Deals Workspace add-ons),
  // so we return all of them, ordered active/on_trial first then newest.
  const { data: subs } = await admin
    .from("subscriptions")
    .select("id,ls_subscription_id,ls_variant_id,status,plan_name,renews_at,ends_at")
    .eq("user_id", user.id)
    .in("status", VISIBLE_STATUSES)
    .order("created_at", { ascending: false });

  const rows = ((subs ?? []) as SubscriptionRow[]).filter(
    (r) => r.ls_subscription_id != null,
  );

  if (rows.length > 0) {
    const subscriptions: Subscription[] = rows
      .map((row) => ({
        id: row.id ?? null,
        ls_subscription_id: String(row.ls_subscription_id),
        ls_variant_id: row.ls_variant_id ?? null,
        status: row.status ?? "active",
        plan_name: row.plan_name ?? null,
        renews_at: row.renews_at ?? null,
        ends_at: row.ends_at ?? null,
      }))
      // created_at desc from the query; re-order active/on_trial ahead of
      // past_due/cancelled for display without another round trip.
      .sort((a, b) => rankStatus(a.status) - rankStatus(b.status));

    const keysBySub = await readLicenseKeysBySubscription(admin, user.id);

    const entries: SubscriptionEntry[] = [];
    for (let i = 0; i < subscriptions.length; i += 1) {
      const subscription = subscriptions[i];
      let licenseKey = subscription.id ? keysBySub.get(subscription.id) ?? null : null;
      // The primary subscription keeps the full resolution chain (user_id ->
      // Lemon Squeezy backfill) so single-sub / webhook-race accounts still
      // resolve a key. Secondaries resolve strictly by subscription_id so the
      // same key is never handed to two different subscriptions.
      if (!licenseKey && i === 0) {
        licenseKey = await resolveLicenseKey(admin, {
          subscriptionId: subscription.id,
          userId: user.id,
          email: user.email ?? null,
        });
      }
      entries.push({
        subscription,
        licenseKey,
        hasLicenseKey: Boolean(licenseKey),
        canUpgradeToAnnual: canUpgradeToAnnual(subscription),
      });
    }

    return buildResponse(entries);
  }

  // Fallback: resolve directly from Lemon Squeezy by email.
  const email = user.email ?? null;
  const lsSubs = email ? await fetchSubscriptionsFromLs(email) : [];

  if (lsSubs.length === 0) {
    return buildResponse([]);
  }

  // Only the primary gets a key here: LS keys can't be mapped to a specific
  // subscription by email alone.
  const primaryLicenseKey = await resolveLicenseKey(admin, {
    subscriptionId: null,
    userId: user.id,
    email,
  });

  const entries: SubscriptionEntry[] = lsSubs.map((subscription, i) => {
    const licenseKey = i === 0 ? primaryLicenseKey : null;
    return {
      subscription,
      licenseKey,
      hasLicenseKey: Boolean(licenseKey),
      canUpgradeToAnnual: canUpgradeToAnnual(subscription),
    };
  });

  return buildResponse(entries);
}
