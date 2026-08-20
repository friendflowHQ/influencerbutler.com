import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService, type AdminService } from "@/lib/admin-service";
import { fetchLicenseFromLs, planForVariantId } from "@/lib/lemonsqueezy";
import { planMetaFor } from "@/lib/pricing-constants";
import { hashLicenseKey } from "@/lib/license-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LookupBody = { email?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Aggregates everything we know about a user by email: profile, subscriptions,
 * orders, license keys, affiliate status, and staff membership. Powers the
 * admin Users page so an operator can see the whole picture before acting.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("users.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: LookupBody;
  try {
    body = (await request.json()) as LookupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Resolve the user via profiles, falling back to an auth.users scan.
  const { data: profile } = await svc
    .from("profiles")
    .select(
      "id,email,display_name,is_affiliate,ls_affiliate_id,affiliate_code,ls_customer_id",
    )
    .ilike("email", email)
    .maybeSingle();

  let userId = typeof profile?.id === "string" ? profile.id : null;
  if (!userId) {
    try {
      const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users?.find((u) => (u.email ?? "").toLowerCase() === email);
      userId = match?.id ?? null;
    } catch {
      // fall through
    }
  }

  if (!userId) {
    return NextResponse.json({ found: false });
  }

  const [subsRes, ordersRes, licensesRes, staffRes] = await Promise.all([
    svc
      .from("subscriptions")
      .select("id,ls_subscription_id,ls_variant_id,status,plan_name,renews_at,ends_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    // discount_code / discount_total_cents exist since 20260704 (manual-apply
    // migration); select them best-effort so a lagging prod schema just yields
    // nulls rather than erroring the whole lookup.
    selectOrdersWithDiscount(svc, userId),
    svc
      .from("license_keys")
      .select("ls_license_key_id,key,key_hash,status,activation_limit,subscription_id,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    svc.from("staff_members").select("role,permissions,is_active").eq("user_id", userId).maybeSingle(),
  ]);

  let licenses = licensesRes.data ?? [];

  // Self-heal existing rows whose key_hash is missing or stale. The desktop
  // app authenticates by key_hash, so a present-but-unhashed row would never
  // activate. The zero-row backfill below only covers a *missing* row, not
  // this case, so repair it here.
  await Promise.all(
    licenses.map(async (lic) => {
      const key = typeof lic.key === "string" ? lic.key.trim() : "";
      const lsId =
        typeof lic.ls_license_key_id === "string" ? lic.ls_license_key_id : "";
      if (!key || !lsId) return;
      const expected = hashLicenseKey(key);
      if (lic.key_hash === expected) return;
      try {
        await svc
          .from("license_keys")
          .update({ key_hash: expected })
          .eq("ls_license_key_id", lsId);
        lic.key_hash = expected;
      } catch (error) {
        console.error("admin/users/lookup: key_hash repair failed", error);
      }
    }),
  );

  // When the local table has no license row, fall back to Lemon Squeezy by
  // email so an operator still sees (and can act on) the key. Best-effort
  // backfill the row so the desktop app can authenticate by key_hash.
  if (licenses.length === 0) {
    const lsLicense = await fetchLicenseFromLs(email);
    if (lsLicense) {
      try {
        await svc.from("license_keys").upsert(
          {
            ls_license_key_id: lsLicense.lsLicenseKeyId,
            user_id: userId,
            subscription_id: null,
            key: lsLicense.key,
            key_hash: hashLicenseKey(lsLicense.key),
            status: lsLicense.status,
            activation_limit: lsLicense.activationLimit,
          },
          { onConflict: "ls_license_key_id" },
        );
      } catch (error) {
        console.error("admin/users/lookup: license backfill failed", error);
      }
      licenses = [
        {
          ls_license_key_id: lsLicense.lsLicenseKeyId,
          key: lsLicense.key,
          key_hash: hashLicenseKey(lsLicense.key),
          status: lsLicense.status,
          activation_limit: lsLicense.activationLimit,
          subscription_id: null,
          created_at: null,
        },
      ];
    }
  }

  const referral = await resolveReferral(svc, userId);
  const pricing = computePricingInsight(
    (subsRes.data ?? []) as SubscriptionRow[],
    (ordersRes.data ?? []) as OrderRow[],
    referral,
  );

  return NextResponse.json({
    found: true,
    userId,
    profile: profile ?? null,
    subscriptions: subsRes.data ?? [],
    orders: ordersRes.data ?? [],
    licenses,
    staff: (staffRes as { data?: unknown }).data ?? null,
    referral,
    pricing,
  });
}

type OrderRow = {
  status?: string | null;
  total?: number | null;
  currency?: string | null;
  discount_code?: string | null;
  discount_total_cents?: number | null;
  created_at?: string | null;
};

/**
 * Orders read for the lookup, including the discount columns (20260704). Those
 * columns are added by a manual-apply migration that can lag prod, so a 42703
 * ("column does not exist") falls back to the base column set rather than
 * failing the whole lookup.
 */
async function selectOrdersWithDiscount(svc: AdminService, userId: string) {
  const withDiscount = await svc
    .from("orders")
    .select("ls_order_id,status,total,currency,discount_code,discount_total_cents,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (!withDiscount.error) return withDiscount;
  console.error("admin/users/lookup: orders discount select failed, falling back", withDiscount.error);
  return svc
    .from("orders")
    .select("ls_order_id,status,total,currency,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

type SubscriptionRow = {
  ls_variant_id?: string | number | null;
  status?: string | null;
  plan_name?: string | null;
  created_at?: string | null;
};

type PricingInsight = {
  planLabel: string | null;
  listCents: number | null;
  /** Net of the most recent real (non-zero) charge, when one exists. */
  netCents: number | null;
  /** Discount code captured on any order (checkout redemption). */
  appliedCode: string | null;
  discountCents: number | null;
  /**
   * True when the customer very likely already holds a discount that a second
   * one would illegally stack on: they were referred by an affiliate, or an
   * order shows a redeemed code / non-zero discount. Drives the operator
   * warning banner (no-stacking policy).
   */
  alreadyDiscounted: boolean;
};

function subStatusRank(status: string | null | undefined): number {
  switch (status) {
    case "active":
      return 0;
    case "on_trial":
      return 1;
    case "past_due":
      return 2;
    case "paused":
      return 3;
    case "cancelled":
      return 4;
    default:
      return 5;
  }
}

/**
 * Derives the "is this customer already discounted, and by how much" picture the
 * operator needs before granting another discount. List price is reliable (from
 * the variant); the exact net recurring price for a still-trialing customer
 * lives only in Lemon Squeezy, so `netCents` is populated only from a real
 * (non-zero) order when one exists. The `alreadyDiscounted` flag is the signal
 * that matters for the no-stacking guardrail.
 */
function computePricingInsight(
  subs: SubscriptionRow[],
  orders: OrderRow[],
  referral: Referral | null,
): PricingInsight {
  const primary = [...subs].sort(
    (a, b) => subStatusRank(a.status) - subStatusRank(b.status),
  )[0];

  const listMeta = primary ? planMetaFor(planForVariantId(primary.ls_variant_id ?? null)) : null;
  const listCents = listMeta ? listMeta.priceCents : null;

  const codedOrder = orders.find((o) => (o.discount_code ?? "").trim().length > 0);
  const discountedOrder = orders.find((o) => (o.discount_total_cents ?? 0) > 0);
  const paidOrder = orders.find((o) => (o.total ?? 0) > 0);

  return {
    planLabel: primary?.plan_name ?? null,
    listCents,
    netCents: paidOrder?.total ?? null,
    appliedCode: codedOrder?.discount_code ?? null,
    discountCents: discountedOrder?.discount_total_cents ?? null,
    alreadyDiscounted: Boolean(
      referral || codedOrder || discountedOrder,
    ),
  };
}

type Referral = {
  code: string | null;
  affiliateUserId: string | null;
  affiliateEmail: string | null;
  affiliateName: string | null;
  attributionStatus: string | null;
  attributedAt: string | null;
};

type AttributionRow = {
  ref_affiliate_user_id?: string | null;
  ref_affiliate_code?: string | null;
  attribution_status?: string | null;
  created_at?: string | null;
};

/**
 * Which affiliate / referral code brought this user in. Reads the attribution
 * columns stamped by the order_created webhook (orders, migration 20260617),
 * falling back to the subscription-level copy (20260702). Both are best-effort:
 * prod schema is migrated manually, so a missing column just means "unknown"
 * here, never a failed lookup.
 */
async function resolveReferral(svc: AdminService, userId: string): Promise<Referral | null> {
  let attributed: AttributionRow | null = null;

  try {
    const { data } = await svc
      .from("orders")
      .select("ref_affiliate_user_id,ref_affiliate_code,attribution_status,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(50);
    attributed =
      ((data ?? []) as AttributionRow[]).find(
        (row) => row.ref_affiliate_user_id || row.ref_affiliate_code,
      ) ?? null;
  } catch (error) {
    console.error("admin/users/lookup: order referral read failed", error);
  }

  if (!attributed) {
    try {
      const { data } = await svc
        .from("subscriptions")
        .select("ref_affiliate_user_id,ref_affiliate_code,attribution_status,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(20);
      attributed =
        ((data ?? []) as AttributionRow[]).find(
          (row) => row.ref_affiliate_user_id || row.ref_affiliate_code,
        ) ?? null;
    } catch (error) {
      console.error("admin/users/lookup: subscription referral read failed", error);
    }
  }

  if (!attributed) return null;

  let affiliateEmail: string | null = null;
  let affiliateName: string | null = null;
  if (attributed.ref_affiliate_user_id) {
    try {
      const { data: aff } = await svc
        .from("profiles")
        .select("email,display_name")
        .eq("id", attributed.ref_affiliate_user_id)
        .maybeSingle();
      affiliateEmail = (aff?.email as string | undefined) ?? null;
      affiliateName = (aff?.display_name as string | undefined) ?? null;
    } catch (error) {
      console.error("admin/users/lookup: affiliate profile read failed", error);
    }
  }

  return {
    code: attributed.ref_affiliate_code ?? null,
    affiliateUserId: attributed.ref_affiliate_user_id ?? null,
    affiliateEmail,
    affiliateName,
    attributionStatus: attributed.attribution_status ?? null,
    attributedAt: attributed.created_at ?? null,
  };
}
