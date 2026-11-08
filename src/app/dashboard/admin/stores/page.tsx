"use client";

// Admin > Creator stores: everything creators sell through our tools (Foyer
// products, Digital Product Butler products once published, memberships),
// with what each sold, what they kept, our 5% fee and Stripe's fees, plus
// newsletter subscriber counts. Searchable by handle, product, Stripe email
// or website name/email. Data from /api/admin/stores (links Worker + website
// accounts); gated by Finance permission plus the email step-up code.

import { Fragment, useCallback, useEffect, useState } from "react";
import StepUpGate from "../finance/StepUpGate";
import { usd } from "../finance/format";

type RangeKey = "30d" | "90d" | "12m" | "all";
type SortKey = "gross" | "fee" | "subscribers" | "products" | "newest";

type Money = {
  grossCents: number;
  salesCount: number;
  stripeFeesCents: number;
  ourFeeCents: number;
  creatorNetCents: number;
  refundsCents: number;
  buyers: number;
  freeClaims?: number;
};

type Store = {
  owner: string;
  email: string;
  handles: string[];
  stripeAccountId: string;
  chargesEnabled: boolean;
  products: { total: number; active: number; draft: number; archived: number; fromDigitalProductButler: number };
  memberships: { total: number; active: number };
  period: Money;
  allTime: Money;
  newsletter: { active: number; pending: number; unsubscribed: number; newInPeriod: number };
  lastSaleAt: number | null;
  lastProductAt: number | null;
};

type Account = { userId: string; email: string | null; name: string | null; licenseStatus: string | null; plan: string | null; planStatus: string | null };

type Totals = {
  period: Money & { sellers: number };
  allTime: Money;
  creatorsWithProducts: number;
  productsLive: number;
  productsTotal: number;
  membershipsLive: number;
  subscribersActive: number;
  creatorsWithSubscribers: number;
  stripeReady: number;
};

type ListResponse = { ok?: boolean; error?: string; stepUpRequired?: boolean; stores?: Store[]; totals?: Totals; accounts?: Record<string, Account> };

type Item = {
  id: string;
  handle: string;
  title: string;
  status: string;
  priceCents: number;
  source?: "foyer" | "digital_product_butler";
  interval?: string;
  activeMembers?: number;
  soldCount?: number;
  freeClaims?: number;
  createdAt: number;
  lastSaleAt: number | null;
  period: Money;
  allTime: Money;
};

type Detail = {
  ok?: boolean;
  error?: string;
  store: Store;
  account: Account | null;
  products: Item[];
  memberships: Item[];
  newsletter: { byStatus: Record<string, number>; bySource: Record<string, number>; growth90d: { day: string; added: number }[] };
};

type Sale = { id: string; itemTitle: string; buyerEmail: string | null; grossCents: number; stripeFeeCents: number; appFeeCents: number; netCents: number; status: string; createdAt: number };

const DAY = 24 * 60 * 60 * 1000;
const RANGES: { key: RangeKey; label: string; days: number | null }[] = [
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "12m", label: "12 months", days: 365 },
  { key: "all", label: "All time", days: null },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: "gross", label: "Sales" },
  { key: "fee", label: "Our fee" },
  { key: "subscribers", label: "Subscribers" },
  { key: "products", label: "Products live" },
  { key: "newest", label: "Newest" },
];
const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  pending_confirm: "Awaiting confirmation",
  pending_review: "In review",
  unsubscribed: "Unsubscribed",
  invalid: "Invalid",
};
const SOURCE_LABEL: Record<string, string> = { foyer_page: "Foyer page", csv_import: "CSV import", facebook_group: "Facebook group" };

function dateOnly(ms: number | null | undefined) {
  if (!ms) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(ms));
  } catch {
    return "-";
  }
}

function rangeParams(key: RangeKey) {
  const r = RANGES.find((x) => x.key === key) ?? RANGES[0];
  const to = Date.now();
  // "All time" = from 2020, before any Foyer sale.
  const from = r.days ? to - r.days * DAY : Date.UTC(2020, 0, 1);
  return { from: String(from), to: String(to) };
}

function storeName(s: Store, a?: Account | null) {
  return s.handles[0] ? `@${s.handles[0]}` : a?.name || a?.email || s.email || `Creator ${s.owner.slice(0, 8)}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-slate-600">{hint}</div> : null}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "draft"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-slate-200 bg-slate-100 text-slate-700";
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status[0]?.toUpperCase() + status.slice(1)}</span>;
}

function MoneyCells({ m }: { m: Money }) {
  return (
    <>
      <td className="px-3 py-2 text-right tabular-nums">{m.salesCount}</td>
      <td className="px-3 py-2 text-right tabular-nums">{usd(m.grossCents)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{usd(m.creatorNetCents)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{usd(m.ourFeeCents)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{usd(m.stripeFeesCents)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{m.refundsCents ? usd(m.refundsCents) : "-"}</td>
    </>
  );
}

const MONEY_HEADERS = ["Sales", "Gross", "They kept", "Our fee", "Stripe fees", "Refunds"];

function ItemsTable({ title, items, kind }: { title: string; items: Item[]; kind: "product" | "membership" }) {
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold text-slate-900">
        {title} ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">None yet.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-2 text-left">{kind === "product" ? "Product" : "Membership"}</th>
                <th scope="col" className="px-3 py-2 text-left">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Price</th>
                {MONEY_HEADERS.map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 text-right">{h}</th>
                ))}
                <th scope="col" className="px-3 py-2 text-right">{kind === "product" ? "Free claims" : "Members"}</th>
                <th scope="col" className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    <div className="font-medium text-slate-900">{it.title || "(untitled)"}</div>
                    <div className="text-xs text-slate-600">
                      @{it.handle}
                      {it.source === "digital_product_butler" ? " · Digital Product Butler" : ""}
                    </div>
                  </td>
                  <td className="px-3 py-2"><StatusPill status={it.status} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {it.priceCents ? usd(it.priceCents) : "Free"}
                    {it.interval ? `/${it.interval === "year" ? "yr" : "mo"}` : ""}
                  </td>
                  <MoneyCells m={it.allTime} />
                  <td className="px-3 py-2 text-right tabular-nums">{kind === "product" ? it.freeClaims ?? 0 : it.activeMembers ?? 0}</td>
                  <td className="px-3 py-2 text-slate-700">{dateOnly(it.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DetailPanel({ owner, rangeKey, onClose }: { owner: string; rangeKey: RangeKey; onClose: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [sales, setSales] = useState<Sale[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Remounted (via key) per creator and period, so state starts empty.
    let cancelled = false;
    const rp = rangeParams(rangeKey);
    (async () => {
      try {
        const [dRes, sRes] = await Promise.all([
          fetch(`/api/admin/stores/${encodeURIComponent(owner)}?${new URLSearchParams(rp)}`, { cache: "no-store" }),
          fetch(`/api/admin/finance/commission/sales?${new URLSearchParams({ ...rp, owner, limit: "25" })}`, { cache: "no-store" }),
        ]);
        const d = (await dRes.json()) as Detail;
        const s = (await sRes.json().catch(() => ({}))) as { sales?: Sale[] };
        if (cancelled) return;
        if (!dRes.ok) setError(d.error ?? `Failed (${dRes.status})`);
        else setDetail(d);
        setSales(s.sales ?? []);
      } catch {
        if (!cancelled) setError("Network error.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [owner, rangeKey]);

  const growth = detail?.newsletter.growth90d ?? [];
  const maxDay = Math.max(1, ...growth.map((g) => g.added));
  const s = detail?.store;
  const a = detail?.account;

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-4 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{s ? storeName(s, a) : "Loading..."}</h2>
          {s ? (
            <p className="mt-1 text-sm text-slate-700">
              {a?.name ? `${a.name} · ` : ""}
              {a?.email || s.email || "No email on file"}
              {a?.plan ? ` · ${a.plan}${a.planStatus ? ` (${a.planStatus})` : ""}` : ""}
              {" · "}
              {s.stripeAccountId ? (s.chargesEnabled ? "Stripe connected" : "Stripe not finished") : "No Stripe yet"}
            </p>
          ) : null}
          {s ? (
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {s.handles.map((h) => (
                <a key={h} className="font-medium text-orange-700 underline" href={`https://links.influencerbutler.com/@${h}`} target="_blank" rel="noreferrer">
                  Open @{h} Foyer
                </a>
              ))}
              {a?.email || s.email ? (
                <a className="font-medium text-orange-700 underline" href={`/dashboard/admin/users?email=${encodeURIComponent(a?.email || s.email)}`}>
                  Open in Users
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
        <button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
          Close
        </button>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      {s ? (
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Sold (all time)" value={usd(s.allTime.grossCents)} hint={`${s.allTime.salesCount} sales, ${s.allTime.buyers} buyers`} />
          <Stat label="They kept" value={usd(s.allTime.creatorNetCents)} hint="After our fee, Stripe fees and refunds" />
          <Stat label="Our fee" value={usd(s.allTime.ourFeeCents)} hint={`Stripe fees ${usd(s.allTime.stripeFeesCents)}`} />
          <Stat label="Subscribers" value={String(s.newsletter.active)} hint={`${s.newsletter.newInPeriod} new in period`} />
        </div>
      ) : null}

      {detail ? (
        <>
          <ItemsTable title="Products" items={detail.products} kind="product" />
          <ItemsTable title="Memberships" items={detail.memberships} kind="membership" />

          <section className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Newsletter</h3>
              <ul className="mt-2 space-y-1 text-sm text-slate-800">
                {Object.entries(detail.newsletter.byStatus).length === 0 ? <li className="text-slate-600">No subscribers yet.</li> : null}
                {Object.entries(detail.newsletter.byStatus).map(([k, v]) => (
                  <li key={k} className="flex justify-between gap-4">
                    <span>{STATUS_LABEL[k] ?? k}</span>
                    <span className="tabular-nums font-medium">{v}</span>
                  </li>
                ))}
              </ul>
              {Object.keys(detail.newsletter.bySource).length ? (
                <p className="mt-2 text-xs text-slate-600">
                  Active by source:{" "}
                  {Object.entries(detail.newsletter.bySource)
                    .map(([k, v]) => `${SOURCE_LABEL[k] ?? k} ${v}`)
                    .join(", ")}
                </p>
              ) : null}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">New subscribers, last 90 days</h3>
              {growth.length === 0 ? (
                <p className="mt-2 text-sm text-slate-600">No new subscribers in the last 90 days.</p>
              ) : (
                <div className="mt-2 flex h-24 items-end gap-px rounded-lg border border-slate-200 bg-white p-2" role="img" aria-label={`${growth.reduce((t, g) => t + g.added, 0)} new subscribers over the last 90 days`}>
                  {growth.map((g) => (
                    <div key={g.day} title={`${g.day}: ${g.added}`} className="flex-1 rounded-t bg-emerald-600" style={{ height: `${Math.max(4, (g.added / maxDay) * 100)}%` }} />
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">Recent sales in this period</h3>
            {sales.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No paid sales in this period.</p>
            ) : (
              <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                    <tr>
                      {["Date", "Item", "Buyer", "Amount", "They kept", "Our fee", "Stripe fee", "Status"].map((h) => (
                        <th key={h} scope="col" className="px-3 py-2 text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sales.map((x) => (
                      <tr key={x.id} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-700">{dateOnly(x.createdAt)}</td>
                        <td className="px-3 py-2">{x.itemTitle}</td>
                        <td className="px-3 py-2 text-slate-700">{x.buyerEmail ?? "-"}</td>
                        <td className="px-3 py-2 tabular-nums">{usd(x.grossCents)}</td>
                        <td className="px-3 py-2 tabular-nums">{usd(x.netCents)}</td>
                        <td className="px-3 py-2 tabular-nums">{usd(x.appFeeCents)}</td>
                        <td className="px-3 py-2 tabular-nums">{usd(x.stripeFeeCents)}</td>
                        <td className="px-3 py-2 capitalize">{x.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function CreatorStoresPage() {
  const [rangeKey, setRangeKey] = useState<RangeKey>("30d");
  const [sort, setSort] = useState<SortKey>("gross");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [stepUp, setStepUp] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // Debounce typing into the actual query.
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ ...rangeParams(rangeKey), sort });
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/stores?${params}`, { cache: "no-store" });
      const json = (await res.json()) as ListResponse;
      if (res.status === 403) {
        if (json.stepUpRequired) setStepUp(true);
        else setForbidden(true);
        return;
      }
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setStepUp(false);
      setData(json);
    } catch {
      setError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [rangeKey, sort, q]);

  useEffect(() => {
    void load();
  }, [load]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }
  if (stepUp) return <StepUpGate onVerified={() => void load()} />;

  const t = data?.totals;
  const stores = data?.stores ?? [];
  const accounts = data?.accounts ?? {};
  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label.toLowerCase();

  return (
    <div className="mx-auto max-w-7xl px-2 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold text-slate-900">Creator stores</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Every creator selling through Foyer: their products (including Digital Product Butler products once published), what they sold and kept,
        our 5% fee, Stripe&apos;s fees, and how many people are on their newsletter. Unpublished Digital Product Butler drafts stay on the
        creator&apos;s computer and don&apos;t show here.
      </p>

      {t ? (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label={`Sold (${rangeLabel})`} value={usd(t.period.grossCents)} hint={`${t.period.salesCount} sales by ${t.period.sellers} creators`} />
          <Stat label="Creators kept" value={usd(t.period.creatorNetCents)} hint={`Refunds ${usd(t.period.refundsCents)}`} />
          <Stat label="Our fee" value={usd(t.period.ourFeeCents)} hint={`Stripe fees ${usd(t.period.stripeFeesCents)}`} />
          <Stat label="All-time sales" value={usd(t.allTime.grossCents)} hint={`Our fee ${usd(t.allTime.ourFeeCents)}`} />
          <Stat label="Creators with products" value={String(t.creatorsWithProducts)} hint={`${t.stripeReady} with Stripe ready to sell`} />
          <Stat label="Products live" value={String(t.productsLive)} hint={`${t.productsTotal} created in total`} />
          <Stat label="Memberships live" value={String(t.membershipsLive)} />
          <Stat label="Newsletter subscribers" value={t.subscribersActive.toLocaleString("en-US")} hint={`Across ${t.creatorsWithSubscribers} creators`} />
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <label className="flex-1 text-sm font-medium text-slate-700" style={{ minWidth: 240 }}>
          Search creators
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Handle, product, email or name"
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal"
          />
        </label>
        <label className="text-sm font-medium text-slate-700">
          Sort by
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </label>
        <div role="group" aria-label="Period" className="flex rounded-lg border border-slate-200 bg-white p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={rangeKey === r.key}
              onClick={() => setRangeKey(r.key)}
              className={["rounded-md px-3 py-1.5 text-sm font-medium", rangeKey === r.key ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"].join(" ")}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="mt-4 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">Creator</th>
              <th scope="col" className="px-3 py-2 text-right">Products</th>
              {MONEY_HEADERS.map((h) => (
                <th key={h} scope="col" className="px-3 py-2 text-right">{h}</th>
              ))}
              <th scope="col" className="px-3 py-2 text-right">Subscribers</th>
              <th scope="col" className="px-3 py-2 text-left">Last sale</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-600">Loading...</td>
              </tr>
            ) : stores.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-slate-600">{q ? "No creators match that search." : "No creator stores yet."}</td>
              </tr>
            ) : (
              stores.map((s) => {
                const a = accounts[s.owner];
                const isOpen = open === s.owner;
                return (
                  <Fragment key={s.owner}>
                    <tr className={["border-t border-slate-100", isOpen ? "bg-orange-50" : ""].join(" ")}>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : s.owner)}
                          className="text-left font-medium text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900"
                        >
                          {storeName(s, a)}
                        </button>
                        <div className="text-xs text-slate-600">
                          {[a?.name, a?.email || s.email, a?.plan].filter(Boolean).join(" · ") || "No website account matched"}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {s.products.active}
                        <span className="text-xs text-slate-600"> / {s.products.total}</span>
                      </td>
                      <MoneyCells m={s.period} />
                      <td className="px-3 py-2 text-right tabular-nums">{s.newsletter.active.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 text-slate-700">{dateOnly(s.lastSaleAt)}</td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={10} className="p-0">
                          <DetailPanel key={`${s.owner}:${rangeKey}`} owner={s.owner} rangeKey={rangeKey} onClose={() => setOpen(null)} />
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        Products shows live / total. Money columns cover the selected period; product rows in a creator&apos;s detail are all time.
        {stores.length >= 200 ? " Showing the top 200: search to narrow down." : ""}
      </p>
    </div>
  );
}
