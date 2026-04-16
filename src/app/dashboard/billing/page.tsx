"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type BillingInvoice = {
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

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasIdentifier, setHasIdentifier] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    const load = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;

        if (!user) {
          setHasIdentifier(false);
          setLoading(false);
          return;
        }

        // Look up Lemon Squeezy subscription identifiers stored by the webhook.
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("ls_subscription_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        const lsSubscriptionIds = (subs ?? [])
          .map((row) => (row as { ls_subscription_id?: string | number }).ls_subscription_id)
          .filter((id): id is string | number => id !== null && id !== undefined);

        const userEmail = user.email ?? undefined;

        if (lsSubscriptionIds.length === 0 && !userEmail) {
          setHasIdentifier(false);
          setLoading(false);
          return;
        }

        const response = await fetch("/api/billing/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lsSubscriptionIds, userEmail }),
        });

        const payload = (await response.json()) as {
          invoices?: BillingInvoice[];
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error || "Could not load billing history");
        }

        setInvoices(payload.invoices ?? []);
      } catch (err) {
        console.error("Failed to load billing history", err);
        setError(
          err instanceof Error ? err.message : "Failed to load billing history",
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
      <h1 className="text-xl sm:text-2xl font-semibold tracking-tight">Billing History</h1>
      <p className="mt-2 text-sm text-slate-600">
        Invoices for your subscription, pulled directly from Lemon Squeezy.
      </p>

      {loading ? (
        <div className="mt-6 space-y-3">
          <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
          <div className="h-10 w-full animate-pulse rounded bg-slate-100" />
        </div>
      ) : error ? (
        <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : !hasIdentifier ? (
        <p className="mt-6 text-sm text-slate-600">
          No billing history yet. Once you start a subscription your invoices will appear here.
        </p>
      ) : invoices.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">
          No invoices to show yet.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Payment</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Amount</th>
                <th className="py-2 pr-4 text-right">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="py-3 pr-4 text-slate-700">
                    {formatDate(invoice.createdAt)}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    {formatBillingReason(invoice.billingReason)}
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {invoice.cardBrand && invoice.cardLastFour
                      ? `${invoice.cardBrand.toUpperCase()} •••• ${invoice.cardLastFour}`
                      : "—"}
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={invoice.status} label={invoice.statusLabel} />
                  </td>
                  <td className="py-3 pr-4 text-right font-medium text-slate-900">
                    {invoice.totalFormatted ??
                      formatAmount(invoice.total, invoice.currency)}
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {invoice.invoiceUrl ? (
                      <a
                        href={invoice.invoiceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-[#f97316] hover:text-[#ea580c]"
                      >
                        View
                      </a>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function StatusBadge({ status, label }: { status: string | null; label: string | null }) {
  const text = label ?? status ?? "Unknown";
  const s = (status ?? "").toLowerCase();

  let className = "bg-slate-100 text-slate-700";
  if (s === "paid") className = "bg-emerald-100 text-emerald-800";
  else if (s === "refunded") className = "bg-yellow-100 text-yellow-800";
  else if (s === "void") className = "bg-slate-200 text-slate-700";
  else if (s === "pending") className = "bg-blue-100 text-blue-800";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${className}`}
    >
      {text}
    </span>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function formatBillingReason(reason: string | null): string {
  if (!reason) return "Subscription payment";
  switch (reason) {
    case "initial":
      return "Initial payment";
    case "renewal":
      return "Renewal";
    case "updated":
      return "Plan change";
    default:
      return reason.charAt(0).toUpperCase() + reason.slice(1).replace(/_/g, " ");
  }
}

function formatAmount(totalCents: number | null, currency: string | null): string {
  if (totalCents == null) return "—";
  const amount = totalCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}
