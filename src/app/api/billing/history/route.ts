import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HistoryRequestBody = {
  lsSubscriptionId?: string | number;
  lsSubscriptionIds?: (string | number)[];
  userEmail?: string;
};

type LsInvoiceAttributes = {
  store_id?: number;
  subscription_id?: number;
  customer_id?: number;
  user_name?: string | null;
  user_email?: string | null;
  billing_reason?: string | null;
  card_brand?: string | null;
  card_last_four?: string | null;
  currency?: string | null;
  currency_rate?: string | null;
  status?: string | null;
  status_formatted?: string | null;
  refunded?: boolean;
  refunded_at?: string | null;
  subtotal?: number;
  discount_total?: number;
  tax?: number;
  total?: number;
  refunded_amount?: number;
  subtotal_usd?: number;
  discount_total_usd?: number;
  tax_usd?: number;
  total_usd?: number;
  refunded_amount_usd?: number;
  subtotal_formatted?: string;
  discount_total_formatted?: string;
  tax_formatted?: string;
  total_formatted?: string;
  refunded_amount_formatted?: string;
  urls?: {
    invoice_url?: string | null;
  };
  created_at?: string;
  updated_at?: string;
};

type LsInvoice = {
  id?: string;
  attributes?: LsInvoiceAttributes;
};

type LsInvoiceListResponse = {
  data?: LsInvoice[];
  meta?: {
    page?: {
      currentPage?: number;
      total?: number;
      lastPage?: number;
    };
  };
};

export type BillingInvoice = {
  id: string;
  subscriptionId: string | null;
  status: string | null;
  statusLabel: string | null;
  billingReason: string | null;
  currency: string | null;
  subtotal: number | null;
  subtotalFormatted: string | null;
  discountTotal: number | null;
  discountTotalFormatted: string | null;
  total: number | null;
  totalFormatted: string | null;
  refundedAmount: number | null;
  refundedAmountFormatted: string | null;
  cardBrand: string | null;
  cardLastFour: string | null;
  invoiceUrl: string | null;
  createdAt: string | null;
};

function toInvoice(raw: LsInvoice): BillingInvoice | null {
  if (!raw.id) return null;
  const a = raw.attributes ?? {};
  return {
    id: raw.id,
    subscriptionId: a.subscription_id != null ? String(a.subscription_id) : null,
    status: a.status ?? null,
    statusLabel: a.status_formatted ?? a.status ?? null,
    billingReason: a.billing_reason ?? null,
    currency: a.currency ?? null,
    subtotal: typeof a.subtotal === "number" ? a.subtotal : null,
    subtotalFormatted: a.subtotal_formatted ?? null,
    // Carried through so the customer sees an itemized discount line (e.g. a
    // referral, welcome, or support/loyalty discount) rather than an
    // unexplained lower total.
    discountTotal: typeof a.discount_total === "number" ? a.discount_total : null,
    discountTotalFormatted: a.discount_total_formatted ?? null,
    total: typeof a.total === "number" ? a.total : null,
    totalFormatted: a.total_formatted ?? null,
    refundedAmount: typeof a.refunded_amount === "number" ? a.refunded_amount : null,
    refundedAmountFormatted: a.refunded_amount_formatted ?? null,
    cardBrand: a.card_brand ?? null,
    cardLastFour: a.card_last_four ?? null,
    invoiceUrl: a.urls?.invoice_url ?? null,
    createdAt: a.created_at ?? null,
  };
}

async function fetchSubscriptionIdsForEmail(email: string): Promise<string[]> {
  const params = new URLSearchParams();
  params.set("filter[user_email]", email);
  params.set("page[size]", "50");

  const response = await lsApi(`/subscriptions?${params.toString()}`, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    console.error("Lemon Squeezy subscriptions lookup failed", {
      status: response.status,
      text,
    });
    return [];
  }

  const payload = (await response.json()) as { data?: { id?: string }[] };
  return (payload.data ?? [])
    .map((item) => item.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
}

async function fetchInvoicesForSubscription(subscriptionId: string): Promise<BillingInvoice[]> {
  const params = new URLSearchParams();
  params.set("filter[subscription_id]", subscriptionId);
  params.set("page[size]", "50");

  const response = await lsApi(`/subscription-invoices?${params.toString()}`, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    console.error("Lemon Squeezy invoices lookup failed", {
      status: response.status,
      subscriptionId,
      text,
    });
    return [];
  }

  const payload = (await response.json()) as LsInvoiceListResponse;
  return (payload.data ?? [])
    .map(toInvoice)
    .filter((invoice): invoice is BillingInvoice => invoice !== null);
}

/**
 * Subscription ids that belong to this user, read server-side with the
 * service-role client keyed on the SESSION user id (never a body value).
 */
async function ownedSubscriptionIds(userId: string): Promise<Set<string>> {
  const owned = new Set<string>();
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("subscriptions")
      .select("ls_subscription_id")
      .eq("user_id", userId);
    if (error) {
      console.error("api/billing/history subscriptions lookup failed", error.message);
      return owned;
    }
    for (const row of data ?? []) {
      const id = (row as { ls_subscription_id?: string | number | null }).ls_subscription_id;
      if (id !== null && id !== undefined && String(id)) owned.add(String(id));
    }
  } catch (error) {
    console.error("api/billing/history subscriptions lookup threw", error);
  }
  return owned;
}

// POST: fetches the signed-in user's billing history from Lemon Squeezy.
//
// SECURITY: this route is NOT covered by middleware (it only matches pages), so
// it authenticates itself. Identity comes ONLY from the verified Supabase
// session (auth.getUser(), never getSession()); any userEmail / subscription id
// in the request body is treated as a hint and ignored unless it is already one
// of the caller's own subscriptions. Without this, anyone could POST a victim's
// email and read their invoices (names, last-4, invoice URLs).
//
// Lemon Squeezy's /subscription-invoices endpoint only supports filtering by
// subscription_id, so we gather the user's subscription IDs (from our own
// subscriptions table, falling back to a lookup by the session email) and then
// fan out one request per subscription.
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user?.id) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let body: HistoryRequestBody = {};
    try {
      body = (await request.json()) as HistoryRequestBody;
    } catch {
      // Body is optional now that identity comes from the session.
    }

    const owned = await ownedSubscriptionIds(user.id);

    // Only honour body-supplied ids that the session user actually owns.
    const requested = new Set<string>();
    if (body.lsSubscriptionId) requested.add(String(body.lsSubscriptionId));
    for (const id of body.lsSubscriptionIds ?? []) {
      if (id) requested.add(String(id));
    }
    const subscriptionIds = new Set<string>(
      requested.size > 0
        ? Array.from(requested).filter((id) => owned.has(id))
        : Array.from(owned),
    );

    // Fall back to the SESSION email (never the body email) when we hold no
    // subscription rows for this user.
    if (subscriptionIds.size === 0 && user.email) {
      const discovered = await fetchSubscriptionIdsForEmail(user.email);
      for (const id of discovered) subscriptionIds.add(id);
    }

    if (subscriptionIds.size === 0) {
      return NextResponse.json({ invoices: [] });
    }

    const results = await Promise.all(
      Array.from(subscriptionIds).map((subId) => fetchInvoicesForSubscription(subId)),
    );

    const invoices = results
      .flat()
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

    return NextResponse.json({ invoices });
  } catch (error) {
    console.error("api/billing/history error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
