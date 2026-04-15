import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";

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

// POST: fetches the user's billing history from Lemon Squeezy.
// Auth is enforced by middleware via cookie check. The client passes in the
// identifiers looked up from Supabase (ls_subscription_id per subscription row,
// plus the user's email) to avoid Vercel -> Supabase DNS failures.
//
// Lemon Squeezy's /subscription-invoices endpoint only supports filtering by
// subscription_id, so we gather the user's subscription IDs (directly, or by
// looking them up via user_email) and then fan out one request per subscription.
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HistoryRequestBody;

    const subscriptionIds = new Set<string>();

    if (body.lsSubscriptionId) {
      subscriptionIds.add(String(body.lsSubscriptionId));
    }
    for (const id of body.lsSubscriptionIds ?? []) {
      if (id) subscriptionIds.add(String(id));
    }

    if (subscriptionIds.size === 0 && body.userEmail) {
      const discovered = await fetchSubscriptionIdsForEmail(body.userEmail);
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
