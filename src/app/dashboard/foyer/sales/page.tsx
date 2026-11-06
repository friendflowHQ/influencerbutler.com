"use client";

// Foyer Sales: the creator's own Foyer digital product and membership sales,
// with what they earned after Stripe's fee and our 5%, refunds, a Refund
// button (full or partial, our fee is returned) and a CSV export. Same data
// and refund action as the Sales tab in Foyer Butler in the desktop app.

import { useCallback, useEffect, useMemo, useState } from "react";

type Totals = {
  grossCents: number;
  salesCount: number;
  refundsCents: number;
  refundCount: number;
  commissionCents: number;
  stripeFeesCents: number;
  netCents: number;
  buyers: number;
};
type Sale = {
  id: string;
  kind: string;
  itemTitle: string;
  buyerEmail: string | null;
  buyerName: string | null;
  grossCents: number;
  stripeFeeCents: number;
  appFeeCents: number;
  netCents: number;
  refundedCents: number;
  refundableCents: number;
  status: "paid" | "partial" | "refunded" | "disputed";
  feesPending: boolean;
  paymentIntentId: string | null;
  createdAt: number;
};
type KeyOption = { id: string; label: string; status: string };
type SalesResponse = {
  ok?: boolean;
  error?: string;
  totals?: Totals;
  previous?: Totals;
  sales?: Sale[];
  nextBefore?: number | null;
  keyId?: string;
  keys?: KeyOption[];
};

const DAY = 24 * 60 * 60 * 1000;
const RANGES = [
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
  { key: "all", label: "All time", days: 0 },
] as const;

const STATUS_LABEL: Record<Sale["status"], string> = { paid: "Paid", partial: "Partly refunded", refunded: "Refunded", disputed: "Disputed" };
const STATUS_STYLE: Record<Sale["status"], string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
  disputed: "bg-rose-50 text-rose-700 border-rose-200",
};

function usd(cents: number | null | undefined) {
  const n = Number(cents) || 0;
  return `${n < 0 ? "-" : ""}$${(Math.abs(n) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function when(ms: number) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}
function errorText(code: string | undefined) {
  switch (code) {
    case "already_refunded":
      return "This sale is already fully refunded.";
    case "amount_too_high":
      return "That is more than what is left to refund on this sale.";
    case "disputed":
      return "The buyer disputed this payment with their bank. Respond to the dispute in Stripe instead.";
    case "stripe_not_connected":
      return "Your Stripe account is not connected. Reconnect it in Foyer Butler, Monetize, Get paid.";
    case "no_license":
      return "No license found on your account yet. Sign in to the desktop app once, then come back.";
    default:
      return code || "Something went wrong.";
  }
}

export default function FoyerSalesPage() {
  const [rangeKey, setRangeKey] = useState<(typeof RANGES)[number]["key"]>("30");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [keyId, setKeyId] = useState("");
  const [data, setData] = useState<SalesResponse | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refunding, setRefunding] = useState<Sale | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const span = useMemo(() => {
    const r = RANGES.find((x) => x.key === rangeKey) ?? RANGES[0];
    const to = Date.now();
    return { from: r.days ? to - r.days * DAY : 1, to };
  }, [rangeKey]);

  const query = useCallback(
    (extra: Record<string, string> = {}) => {
      const p = new URLSearchParams({ from: String(span.from), to: String(span.to), ...extra });
      if (q.trim()) p.set("q", q.trim());
      if (status) p.set("status", status);
      if (keyId) p.set("keyId", keyId);
      return p.toString();
    },
    [span, q, status, keyId],
  );

  const load = useCallback(
    async (before?: number | null) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/me/foyer/sales?${query(before ? { before: String(before) } : {})}`, { cache: "no-store" });
        const json = (await res.json()) as SalesResponse;
        if (!res.ok) {
          setError(errorText(json.error));
          return;
        }
        setData(json);
        setSales((prev) => (before ? [...prev, ...(json.sales ?? [])] : json.sales ?? []));
        if (!keyId && json.keyId) setKeyId(json.keyId);
      } catch {
        setError("Network error. Please refresh.");
      } finally {
        setLoading(false);
      }
    },
    [query, keyId],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const t = data?.totals;
  const keys = data?.keys ?? [];

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Foyer Sales</h1>
          <p className="mt-1 text-sm text-slate-600">
            Every sale on your Foyer page, what you earned after fees, and refunds. Money goes straight to your own Stripe account.
          </p>
        </div>
        <a
          href={`/api/me/foyer/sales/export?${query()}`}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Download CSV
        </a>
      </header>

      {keys.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
          <label htmlFor="sales-key" className="font-medium text-slate-700">
            Showing sales for
          </label>
          <select
            id="sales-key"
            value={keyId}
            onChange={(e) => setKeyId(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
          >
            {keys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label} ({k.status})
              </option>
            ))}
          </select>
          <span className="text-xs text-slate-500">Each license key has its own Foyer page and sales.</span>
        </div>
      ) : null}

      {notice ? (
        <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRangeKey(r.key)}
            className={[
              "rounded-full border px-3 py-1 text-sm",
              rangeKey === r.key ? "border-orange-400 bg-orange-50 font-medium text-orange-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            ].join(" ")}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "You earned", value: usd(t?.netCents), hint: "after all fees and refunds", tone: "text-emerald-700" },
          { label: "Sales", value: usd(t?.grossCents), hint: `${t?.salesCount ?? 0} payment${t?.salesCount === 1 ? "" : "s"}, ${t?.buyers ?? 0} buyer${t?.buyers === 1 ? "" : "s"}`, tone: "text-slate-900" },
          { label: "Fees", value: usd((t?.stripeFeesCents ?? 0) + (t?.commissionCents ?? 0)), hint: `Stripe ${usd(t?.stripeFeesCents)}, Influencer Butler 5% ${usd(t?.commissionCents)}`, tone: "text-slate-900" },
          { label: "Refunded", value: usd(t?.refundsCents), hint: `${t?.refundCount ?? 0} refund${t?.refundCount === 1 ? "" : "s"}`, tone: "text-amber-700" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${c.tone}`}>{data ? c.value : "..."}</p>
            <p className="mt-1 text-xs text-slate-500">{c.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search buyer or product"
            aria-label="Search buyer or product"
            className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter by status"
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
          >
            <option value="">All sales</option>
            <option value="paid">Paid</option>
            <option value="partial">Partly refunded</option>
            <option value="refunded">Refunded</option>
            <option value="disputed">Disputed</option>
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                <th className="px-4 py-2">Buyer</th>
                <th className="px-4 py-2">Product</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">You earned</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{when(s.createdAt)}</td>
                  <td className="px-4 py-2">
                    <div className="text-slate-900">{s.buyerName || "-"}</div>
                    {s.buyerEmail ? (
                      <a href={`mailto:${s.buyerEmail}`} className="text-xs text-slate-500 hover:underline">
                        {s.buyerEmail}
                      </a>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-slate-900">{s.itemTitle || "-"}</div>
                    {s.kind !== "sale" ? <div className="text-xs capitalize text-slate-500">{s.kind}</div> : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {usd(s.grossCents)}
                    {s.refundedCents ? <div className="text-xs text-amber-700">-{usd(s.refundedCents)} refunded</div> : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className="font-medium text-emerald-700">{usd(s.netCents)}</span>
                    <div className="text-[11px] text-slate-500">
                      {s.feesPending ? "fees not final yet" : `Stripe ${usd(s.stripeFeeCents)}, IB ${usd(s.appFeeCents)}`}
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {s.refundableCents > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setNotice(null);
                          setRefunding(s);
                        }}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Refund
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!sales.length && !loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No sales here yet. When someone buys from your Foyer page, it shows up here.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
          <span>{loading ? "Loading..." : `${sales.length} shown`}</span>
          {data?.nextBefore ? (
            <button type="button" onClick={() => void load(data.nextBefore)} className="font-medium text-slate-700 underline">
              Load more
            </button>
          ) : null}
        </div>
      </div>

      {refunding ? (
        <RefundDialog
          sale={refunding}
          keyId={keyId}
          onClose={() => setRefunding(null)}
          onDone={(msg) => {
            setRefunding(null);
            setNotice(msg);
            void load();
          }}
        />
      ) : null}
    </section>
  );
}

function RefundDialog({ sale, keyId, onClose, onDone }: { sale: Sale; keyId: string; onClose: () => void; onDone: (msg: string) => void }) {
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState((sale.refundableCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cents = full ? sale.refundableCents : Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && cents <= sale.refundableCents;
  const feeBack = sale.grossCents > 0 && valid ? Math.round((sale.appFeeCents * cents) / sale.grossCents) : 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/me/foyer/sales/${encodeURIComponent(sale.id)}/refund${keyId ? `?keyId=${encodeURIComponent(keyId)}` : ""}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amountCents: full ? undefined : cents, reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(errorText(json.error));
        return;
      }
      onDone(`Refunded ${usd(cents)} to ${sale.buyerName || sale.buyerEmail || "the buyer"}. They got an email.`);
    } catch {
      setErr("Network error. Check your Stripe dashboard before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="refund-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="refund-title" className="text-lg font-semibold text-slate-900">
          Refund {sale.buyerName || sale.buyerEmail}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {sale.itemTitle}. Paid {usd(sale.grossCents)}
          {sale.refundedCents ? `, ${usd(sale.refundedCents)} already refunded` : ""}.
        </p>
        <fieldset className="mt-4 space-y-2 text-sm">
          <legend className="sr-only">How much to refund</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="refund-kind" checked={full} onChange={() => setFull(true)} /> Full refund ({usd(sale.refundableCents)})
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="refund-kind" checked={!full} onChange={() => setFull(false)} /> Part of it
            {!full ? (
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-label="Refund amount in dollars"
                className="ml-2 w-24 rounded-md border border-slate-300 px-2 py-1 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
              />
            ) : null}
          </label>
        </fieldset>
        <label className="mt-4 block text-sm">
          <span className="text-slate-700">Note for your records (optional)</span>
          <input
            type="text"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-200"
          />
        </label>
        <ul className="mt-4 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <li>Your buyer gets the money back on their card in 5 to 10 business days.</li>
          <li>We give back our 5% on the refunded amount ({usd(feeBack)}). Stripe keeps its processing fee.</li>
          <li>{full ? "A full refund turns off their download." : "A partial refund keeps their download working."}</li>
          <li>We email your buyer to let them know.</li>
        </ul>
        {err ? <p className="mt-3 text-sm text-red-600">{err}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void submit()}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-orange-600 disabled:opacity-50"
          >
            {busy ? "Refunding..." : `Refund ${valid ? usd(cents) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
