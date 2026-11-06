"use client";

// Foyer commission tab: what Influencer Butler earns from creators' Foyer
// digital-product and membership sales (our 5% Stripe application fee), by
// period, by creator and by buyer, plus a support Refund on any payment.
// Data comes from the links Worker's commerce ledger via
// /api/admin/finance/commission*. Bars are plain CSS like the Revenue tab.

import { useCallback, useEffect, useMemo, useState } from "react";
import { usd, shortDate } from "./format";

type Bucket = "day" | "week" | "month";
type RangeKey = "30d" | "90d" | "12m" | "all";

type Totals = {
  grossCents: number;
  salesCount: number;
  refundsCents: number;
  refundCount: number;
  disputesCents: number;
  feesChargedCents: number;
  commissionCents: number;
  feesReturnedCents: number;
  stripeFeesCents: number;
  netCents: number;
  sellers: number;
  buyers: number;
};

type Creator = {
  owner: string;
  email: string;
  handles: string[];
  stripeAccountId: string;
  chargesEnabled: boolean;
  grossCents: number;
  salesCount: number;
  commissionCents: number;
  refundsCents: number;
  buyers: number;
  lastSaleAt: number | null;
};

type Sale = {
  id: string;
  owner: string;
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
  stripeAccountId: string | null;
  createdAt: number;
};

type SummaryResponse = {
  ok?: boolean;
  error?: string;
  current?: Totals;
  previous?: Totals;
  series?: { bucket: string; grossCents: number; commissionCents: number; refundsCents: number; sales: number }[];
  creators?: Creator[];
};

const DAY = 24 * 60 * 60 * 1000;
const RANGES: { key: RangeKey; label: string; days: number | null; bucket: Bucket }[] = [
  { key: "30d", label: "30 days", days: 30, bucket: "day" },
  { key: "90d", label: "90 days", days: 90, bucket: "week" },
  { key: "12m", label: "12 months", days: 365, bucket: "month" },
  { key: "all", label: "All time", days: null, bucket: "month" },
];

const STATUS_STYLE: Record<Sale["status"], string> = {
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  refunded: "bg-slate-100 text-slate-600 border-slate-200",
  disputed: "bg-rose-50 text-rose-700 border-rose-200",
};
const STATUS_LABEL: Record<Sale["status"], string> = { paid: "Paid", partial: "Partly refunded", refunded: "Refunded", disputed: "Disputed" };

function delta(cur: number, prev: number) {
  if (!prev && !cur) return null;
  if (!prev) return { text: "new", tone: "text-emerald-600" };
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  if (Math.abs(pct) < 0.5) return { text: "flat", tone: "text-slate-400" };
  return pct > 0 ? { text: `↑ ${pct.toFixed(0)}%`, tone: "text-emerald-600" } : { text: `↓ ${Math.abs(pct).toFixed(0)}%`, tone: "text-rose-600" };
}

function dateTime(ms: number) {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

function creatorLabel(c: Creator | undefined, owner: string) {
  if (!c) return owner.slice(0, 8);
  return c.handles[0] ? `@${c.handles[0]}` : c.email || owner.slice(0, 8);
}

export default function CommissionTab() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const range = RANGES.find((r) => r.key === rangeKey) ?? RANGES[0];
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [owner, setOwner] = useState<string>("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sales, setSales] = useState<Sale[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  const [refunding, setRefunding] = useState<Sale | null>(null);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  const span = useMemo(() => {
    const to = Date.now();
    return { from: range.days ? to - range.days * DAY : 1, to };
    // Recompute only when the range changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeKey]);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/commission?from=${span.from}&to=${span.to}&bucket=${range.bucket}`, { cache: "no-store" });
      const json = (await res.json()) as SummaryResponse;
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setSummary(json);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [span, range.bucket]);

  const loadSales = useCallback(
    async (append: boolean, before?: number | null) => {
      setSalesLoading(true);
      setSalesError(null);
      const params = new URLSearchParams({ from: String(span.from), to: String(span.to), limit: "50" });
      if (owner) params.set("owner", owner);
      if (q.trim()) params.set("q", q.trim());
      if (status) params.set("status", status);
      if (append && before) params.set("before", String(before));
      try {
        const res = await fetch(`/api/admin/finance/commission/sales?${params}`, { cache: "no-store" });
        const json = (await res.json()) as { sales?: Sale[]; nextBefore?: number | null; error?: string };
        if (!res.ok) {
          setSalesError(json.error ?? `Failed (${res.status})`);
          return;
        }
        setSales((prev) => (append ? [...prev, ...(json.sales ?? [])] : json.sales ?? []));
        setNextBefore(json.nextBefore ?? null);
      } catch {
        setSalesError("Network error.");
      } finally {
        setSalesLoading(false);
      }
    },
    [span, owner, q, status],
  );

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    const t = setTimeout(() => void loadSales(false), 250);
    return () => clearTimeout(t);
  }, [loadSales]);

  const creatorsByOwner = useMemo(() => {
    const m = new Map<string, Creator>();
    for (const c of summary?.creators ?? []) m.set(c.owner, c);
    return m;
  }, [summary]);

  async function runBackfill() {
    setBackfillMsg("Importing older sales...");
    try {
      const res = await fetch("/api/admin/finance/commission/backfill", { method: "POST" });
      const json = (await res.json()) as { recorded?: number; remaining?: number; error?: string };
      if (!res.ok) {
        setBackfillMsg(json.error ?? "Import failed.");
        return;
      }
      setBackfillMsg(`Imported ${json.recorded ?? 0} sale(s).${json.remaining ? ` ${json.remaining} left: click again.` : " All caught up."}`);
      void loadSummary();
      void loadSales(false);
    } catch {
      setBackfillMsg("Network error.");
    }
  }

  const cur = summary?.current;
  const prev = summary?.previous;
  const series = summary?.series ?? [];
  const maxValue = Math.max(1, ...series.map((p) => Math.max(0, p.commissionCents)));

  const cards = cur
    ? [
        { label: "Our commission", value: usd(cur.commissionCents), d: prev ? delta(cur.commissionCents, prev.commissionCents) : null, tone: "#059669", hint: `${usd(cur.feesChargedCents)} charged, ${usd(cur.feesReturnedCents)} returned on refunds` },
        { label: "Sales processed", value: usd(cur.grossCents), d: prev ? delta(cur.grossCents, prev.grossCents) : null, tone: "#0f172a", hint: `${cur.salesCount} payment${cur.salesCount === 1 ? "" : "s"}` },
        { label: "Refunded", value: usd(cur.refundsCents), d: null, tone: "#b45309", hint: `${cur.refundCount} refund${cur.refundCount === 1 ? "" : "s"}${cur.disputesCents ? `, ${usd(cur.disputesCents)} disputed` : ""}` },
        { label: "Creators selling", value: String(cur.sellers), d: prev ? delta(cur.sellers, prev.sellers) : null, tone: "#0f172a", hint: `${cur.buyers} unique buyer${cur.buyers === 1 ? "" : "s"}` },
        { label: "Creators earned", value: usd(cur.netCents), d: null, tone: "#0f172a", hint: `after ${usd(cur.stripeFeesCents)} Stripe fees` },
      ]
    : [];

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Our 5% platform fee on every Foyer sale, paid automatically by Stripe into our account. Refunds return our fee in
          proportion. Creators keep their sales in their own Stripe account.
        </p>
        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => setRangeKey(r.key)}
                className={[
                  "rounded-md px-3 py-1 text-xs font-medium",
                  rangeKey === r.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                ].join(" ")}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading && !summary ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {cards.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {cards.map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className="mt-1 text-xl font-semibold" style={{ color: c.tone }}>
                {c.value}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {c.d ? <span className={`mr-1 font-medium ${c.d.tone}`}>{c.d.text}</span> : null}
                {c.hint}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {series.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Our commission
            </span>
          </div>
          <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 180 }}>
            {series.map((p) => (
              <div
                key={p.bucket}
                className="relative flex min-w-[14px] flex-1 items-end"
                title={`${p.bucket}: ${usd(p.grossCents)} sales, ${usd(p.commissionCents)} commission, ${usd(p.refundsCents)} refunded`}
              >
                <div className="w-full rounded-t bg-emerald-500" style={{ height: `${Math.max(2, (Math.max(0, p.commissionCents) / maxValue) * 170)}px` }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400">
            <span>{series[0]?.bucket}</span>
            <span>Hover a bar for sales and refunds in that period.</span>
            <span>{series[series.length - 1]?.bucket}</span>
          </div>
        </div>
      ) : !loading && cur && cur.salesCount === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">
          No Foyer sales in this period yet.
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">By creator</h3>
          <div className="flex items-center gap-3">
            {backfillMsg ? <span className="text-xs text-slate-500">{backfillMsg}</span> : null}
            <button type="button" onClick={() => void runBackfill()} className="text-xs font-medium text-slate-600 underline hover:text-slate-900">
              Import older sales
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Creator</th>
                <th className="px-4 py-2 text-right">Sales</th>
                <th className="px-4 py-2 text-right">Processed</th>
                <th className="px-4 py-2 text-right">Our commission</th>
                <th className="px-4 py-2 text-right">Refunded</th>
                <th className="px-4 py-2 text-right">Buyers</th>
                <th className="px-4 py-2">Last sale</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {(summary?.creators ?? []).map((c) => (
                <tr key={c.owner} className={["border-t border-slate-100", owner === c.owner ? "bg-emerald-50/60" : ""].join(" ")}>
                  <td className="px-4 py-2">
                    <div className="font-medium text-slate-900">{creatorLabel(c, c.owner)}</div>
                    <div className="text-xs text-slate-500">
                      {c.email || "no email yet"}
                      {!c.chargesEnabled ? <span className="ml-2 text-rose-600">Stripe not ready</span> : null}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right">{c.salesCount}</td>
                  <td className="px-4 py-2 text-right">{usd(c.grossCents)}</td>
                  <td className="px-4 py-2 text-right font-medium text-emerald-700">{usd(c.commissionCents)}</td>
                  <td className="px-4 py-2 text-right">{c.refundsCents ? usd(c.refundsCents) : "-"}</td>
                  <td className="px-4 py-2 text-right">{c.buyers}</td>
                  <td className="px-4 py-2 text-slate-600">{c.lastSaleAt ? shortDate(new Date(c.lastSaleAt).toISOString()) : "-"}</td>
                  <td className="px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => setOwner(owner === c.owner ? "" : c.owner)}
                      className="text-xs font-medium text-slate-600 underline hover:text-slate-900"
                    >
                      {owner === c.owner ? "Show all sales" : "View sales"}
                    </button>
                  </td>
                </tr>
              ))}
              {!(summary?.creators ?? []).length ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                    No creator sales in this period.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">
            Sales {owner ? <span className="font-normal text-slate-500">for {creatorLabel(creatorsByOwner.get(owner), owner)}</span> : null}
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search buyer email, name or item"
              className="w-64 rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
            />
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partly refunded</option>
              <option value="refunded">Refunded</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>
        </div>
        {salesError ? <p className="px-4 py-3 text-sm text-rose-600">{salesError}</p> : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Date</th>
                {!owner ? <th className="px-4 py-2">Creator</th> : null}
                <th className="px-4 py-2">Buyer</th>
                <th className="px-4 py-2">Item</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Our fee</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id} className="border-t border-slate-100 align-top">
                  <td className="whitespace-nowrap px-4 py-2 text-slate-600">{dateTime(s.createdAt)}</td>
                  {!owner ? (
                    <td className="px-4 py-2">
                      <button type="button" className="text-left text-slate-700 underline-offset-2 hover:underline" onClick={() => setOwner(s.owner)}>
                        {creatorLabel(creatorsByOwner.get(s.owner), s.owner)}
                      </button>
                    </td>
                  ) : null}
                  <td className="px-4 py-2">
                    <div className="text-slate-900">{s.buyerName || "-"}</div>
                    <div className="text-xs text-slate-500">{s.buyerEmail}</div>
                  </td>
                  <td className="px-4 py-2">
                    <div className="text-slate-900">{s.itemTitle || "-"}</div>
                    {s.kind !== "sale" ? <div className="text-xs capitalize text-slate-500">{s.kind}</div> : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {usd(s.grossCents)}
                    {s.refundedCents ? <div className="text-xs text-amber-700">-{usd(s.refundedCents)} refunded</div> : null}
                  </td>
                  <td className="px-4 py-2 text-right text-emerald-700">
                    {usd(s.appFeeCents)}
                    {s.feesPending ? <div className="text-[10px] text-slate-400">estimated</div> : null}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[s.status]}`}>{STATUS_LABEL[s.status]}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right">
                    {s.refundableCents > 0 ? (
                      <button
                        type="button"
                        onClick={() => setRefunding(s)}
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Refund
                      </button>
                    ) : null}
                    {s.stripeAccountId && s.paymentIntentId ? (
                      <a
                        href={`https://dashboard.stripe.com/connect/accounts/${s.stripeAccountId}/payments/${s.paymentIntentId}`}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 text-xs text-slate-500 underline hover:text-slate-800"
                      >
                        Stripe
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!sales.length && !salesLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                    No sales match.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 text-xs text-slate-500">
          <span>{salesLoading ? "Loading..." : `${sales.length} shown`}</span>
          {nextBefore ? (
            <button type="button" onClick={() => void loadSales(true, nextBefore)} className="font-medium text-slate-700 underline">
              Load more
            </button>
          ) : null}
        </div>
      </div>

      {refunding ? (
        <RefundDialog
          sale={refunding}
          creator={creatorLabel(creatorsByOwner.get(refunding.owner), refunding.owner)}
          onClose={() => setRefunding(null)}
          onDone={() => {
            setRefunding(null);
            void loadSummary();
            void loadSales(false);
          }}
        />
      ) : null}
    </div>
  );
}

function RefundDialog({ sale, creator, onClose, onDone }: { sale: Sale; creator: string; onClose: () => void; onDone: () => void }) {
  const [full, setFull] = useState(true);
  const [amount, setAmount] = useState((sale.refundableCents / 100).toFixed(2));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cents = full ? sale.refundableCents : Math.round(Number(amount.replace(/[$,\s]/g, "")) * 100);
  const valid = Number.isFinite(cents) && cents > 0 && cents <= sale.refundableCents;
  const feeBack = sale.grossCents > 0 ? Math.round((sale.appFeeCents * (valid ? cents : 0)) / sale.grossCents) : 0;

  async function submit() {
    if (!valid || busy) return;
    if (!window.confirm(`Refund ${usd(cents)} to ${sale.buyerEmail || "the buyer"} from ${creator}'s Stripe account? This cannot be undone.`)) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/finance/commission/refund", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ledgerId: sale.id, amountCents: full ? undefined : cents, reason }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? `Refund failed (${res.status})`);
        return;
      }
      onDone();
    } catch {
      setErr("Network error. Check Stripe before trying again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-labelledby="refund-title">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="refund-title" className="text-lg font-semibold text-slate-900">
          Refund this sale
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {sale.itemTitle || "Item"} to {sale.buyerName || sale.buyerEmail} ({creator}). Paid {usd(sale.grossCents)}
          {sale.refundedCents ? `, ${usd(sale.refundedCents)} already refunded` : ""}.
        </p>

        <fieldset className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" checked={full} onChange={() => setFull(true)} /> Full refund ({usd(sale.refundableCents)})
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={!full} onChange={() => setFull(false)} /> Partial refund
            {!full ? (
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="ml-2 w-24 rounded-md border border-slate-300 px-2 py-1"
                aria-label="Refund amount in dollars"
              />
            ) : null}
          </label>
        </fieldset>

        <label className="mt-4 block text-sm">
          <span className="text-slate-700">Reason (shown to the creator)</span>
          <input
            type="text"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Buyer could not open the file"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5"
          />
        </label>

        <ul className="mt-4 space-y-1 rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          <li>The buyer gets the money back on their card in 5 to 10 business days.</li>
          <li>We return our fee on the refunded amount ({usd(feeBack)}) to the creator. Stripe keeps its processing fee.</li>
          <li>{full ? "A full refund turns off the buyer's download." : "A partial refund keeps the buyer's download working."}</li>
          <li>The buyer and the creator both get an email.</li>
        </ul>

        {err ? <p className="mt-3 text-sm text-rose-600">{err}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void submit()}
            className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {busy ? "Refunding..." : `Refund ${valid ? usd(cents) : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Overview tab card: last 30 days of Foyer commission, links to the full tab. */
export function FoyerCommissionOverviewCard({ onOpen }: { onOpen: () => void }) {
  const [data, setData] = useState<{ current?: Totals; previous?: Totals } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const to = Date.now();
    fetch(`/api/admin/finance/commission?from=${to - 30 * DAY}&to=${to}&bucket=day`, { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as SummaryResponse;
        if (!alive) return;
        if (!res.ok) setError(json.error ?? "Unavailable");
        else setData(json);
      })
      .catch(() => alive && setError("Unavailable"));
    return () => {
      alive = false;
    };
  }, []);

  const cur = data?.current;
  const d = cur && data?.previous ? delta(cur.commissionCents, data.previous.commissionCents) : null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">Foyer commission (last 30 days)</p>
        {cur ? (
          <p className="mt-1 text-sm text-slate-700">
            <span className="text-xl font-semibold text-emerald-700">{usd(cur.commissionCents)}</span>
            {d ? <span className={`ml-2 text-xs font-medium ${d.tone}`}>{d.text}</span> : null}
            <span className="ml-2 text-xs text-slate-500">
              on {usd(cur.grossCents)} from {cur.salesCount} sale{cur.salesCount === 1 ? "" : "s"} by {cur.sellers} creator{cur.sellers === 1 ? "" : "s"}
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">{error ?? "Loading..."}</p>
        )}
      </div>
      <button type="button" onClick={onOpen} className="text-sm font-medium text-emerald-800 underline hover:text-emerald-900">
        Open Foyer commission
      </button>
    </div>
  );
}
