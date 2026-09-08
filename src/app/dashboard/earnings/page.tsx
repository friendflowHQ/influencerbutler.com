"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  EARNINGS_CATEGORIES,
  EARNINGS_CATEGORY_LABELS,
  type EarningsCategory,
} from "@/lib/desktop-earnings";

/**
 * /dashboard/earnings - read-only creator earnings synced from the desktop
 * app's Earnings Intelligence workspace. Free tier on purpose and designed to
 * be read on a phone: everything stacks at 375px, wide content (the bar chart
 * and the ASIN table) scrolls inside its own container.
 */

type MonthRow = {
  month: string; // "YYYY-MM-01"
  onsiteCents: number;
  ccCents: number;
  offsiteCents: number;
  brandDealCents: number;
  internationalCents: number;
  bonusCents: number;
  totalCents: number;
};

type AsinRow = {
  period: string;
  asin: string;
  marketplace: string;
  title: string | null;
  imageUrl: string | null;
  amountCents: number;
  units: number;
  orders: number;
  rank: number;
};

type Totals = Record<`${EarningsCategory}Cents`, number> & {
  totalCents: number;
  fromMonth: string;
  toMonth: string;
};

type EarningsResponse = {
  ok?: boolean;
  error?: string;
  migrationPending?: boolean;
  meta: {
    lastSyncedAt: string;
    appVersion: string | null;
    currency: string;
    monthsCount: number;
    asinsCount: number;
  } | null;
  months: MonthRow[];
  totalsByCategory: Totals | null;
  topAsins: { all: AsinRow[]; "12m": AsinRow[] };
  offsiteTracked: boolean;
};

const CATEGORY_COLORS: Record<EarningsCategory, string> = {
  onsite: "#f97316",
  cc: "#2563eb",
  offsite: "#7c3aed",
  brandDeal: "#059669",
  international: "#0891b2",
  bonus: "#ca8a04",
};

const centsKey = (c: EarningsCategory) => `${c}Cents` as const;

function monthLabel(month: string, style: "short" | "long" = "short"): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m || 1) - 1, 1));
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: style === "long" ? "numeric" : "2-digit",
    timeZone: "UTC",
  }).format(date);
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), "day");
  return rtf.format(Math.round(diffSec / (86400 * 30)), "month");
}

function useMoney(currency: string) {
  return useMemo(() => {
    let fmt: Intl.NumberFormat;
    try {
      fmt = new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 });
    } catch {
      fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
    }
    return (cents: number) => fmt.format(cents / 100);
  }, [currency]);
}

export default function EarningsPage() {
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/dashboard/earnings", { cache: "no-store" });
        const json = (await res.json()) as EarningsResponse;
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json.error ?? `Failed to load (${res.status})`);
          return;
        }
        setData(json);
      } catch (err) {
        console.error("earnings dashboard load failed", err);
        if (!cancelled) setLoadError("Network error. Please refresh to try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const currency = data?.meta?.currency ?? "USD";
  const money = useMoney(currency);

  if (loading) return <LoadingSkeleton />;

  if (loadError || !data) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold text-slate-900">Earnings</h1>
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800 shadow-sm">
          {loadError ?? "We couldn't load your earnings."}
        </div>
      </div>
    );
  }

  const hasData =
    !data.migrationPending &&
    data.meta !== null &&
    (data.months.length > 0 || data.topAsins.all.length > 0 || data.topAsins["12m"].length > 0);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Earnings</p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
          Your creator earnings, anywhere
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          A read-only copy of the desktop app&apos;s Earnings Intelligence, so you can check your
          numbers from your phone.
        </p>
        {data.meta ? (
          <p className="mt-2 text-sm text-slate-500" data-testid="earnings-last-synced">
            Last synced from the desktop app{" "}
            <time dateTime={data.meta.lastSyncedAt} title={new Date(data.meta.lastSyncedAt).toLocaleString()}>
              {relativeTime(data.meta.lastSyncedAt)}
            </time>
            {data.meta.appVersion ? <>, app {data.meta.appVersion}</> : null}.
          </p>
        ) : null}
      </header>

      {!hasData ? <EmptyState migrationPending={data.migrationPending === true} /> : null}

      {hasData ? (
        <>
          {!data.offsiteTracked ? <OffsiteNotice /> : null}

          {data.totalsByCategory ? (
            <CategoryTotals totals={data.totalsByCategory} money={money} />
          ) : null}

          {data.months.length > 0 ? <MonthlyChart months={data.months} money={money} /> : null}

          <TopAsins all={data.topAsins.all} last12={data.topAsins["12m"]} money={money} />

          <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Export</p>
            <p className="mt-1 text-sm text-slate-600">
              Download what is synced here as CSV. Amounts are in cents, in {currency}.
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              <a
                href="/api/dashboard/earnings/export?kind=months"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Download months CSV
              </a>
              <a
                href="/api/dashboard/earnings/export?kind=asins"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Download top ASINs CSV
              </a>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

function OffsiteNotice() {
  return (
    <div
      className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900"
      role="status"
    >
      <span className="font-semibold">Off-site commissions are not tracked yet.</span> The totals
      below cover on-site, Creator Connections, brand deals, international and bonus earnings only.
    </div>
  );
}

function CategoryTotals({ totals, money }: { totals: Totals; money: (c: number) => string }) {
  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900">Last 12 months</h2>
        <p className="text-xs text-slate-500">
          {monthLabel(totals.fromMonth, "long")} to {monthLabel(totals.toMonth, "long")}
        </p>
      </div>
      <div className="mt-3 grid gap-3 grid-cols-2 lg:grid-cols-4">
        <div className="col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total</p>
          <p className="mt-2 text-3xl font-bold tabular-nums text-slate-900">{money(totals.totalCents)}</p>
        </div>
        {EARNINGS_CATEGORIES.map((c) => (
          <div key={c} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 flex-none rounded-sm"
                style={{ backgroundColor: CATEGORY_COLORS[c] }}
              />
              <span className="truncate">{EARNINGS_CATEGORY_LABELS[c]}</span>
            </p>
            <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">{money(totals[centsKey(c)])}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

const CHART_MONTHS = 12;

function MonthlyChart({ months, money }: { months: MonthRow[]; money: (c: number) => string }) {
  const shown = months.slice(-CHART_MONTHS);
  const barMax = Math.max(
    1,
    ...shown.map((m) => EARNINGS_CATEGORIES.reduce((sum, c) => sum + Math.max(0, m[centsKey(c)]), 0)),
  );

  // Layout in SVG units. The container scrolls horizontally on phones instead
  // of shrinking the labels into illegibility.
  const padLeft = 64;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 28;
  const slot = 48;
  const barWidth = 30;
  const plotHeight = 200;
  const width = padLeft + padRight + shown.length * slot;
  const height = padTop + plotHeight + padBottom;
  const y = (cents: number) => padTop + plotHeight - (cents / barMax) * plotHeight;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(barMax * f));

  const total = shown.reduce((s, m) => s + m.totalCents, 0);
  const describe = `Stacked monthly earnings for ${shown.length} months, ${monthLabel(shown[0].month, "long")} to ${monthLabel(shown[shown.length - 1].month, "long")}, totalling ${money(total)}.`;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">By month</p>
      <p className="mt-1 text-sm text-slate-600">
        Each bar is one month, stacked by where the money came from.
      </p>
      <div className="mt-4 overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-labelledby="earnings-chart-title earnings-chart-desc"
          className="block max-w-none"
          style={{ minWidth: width }}
        >
          <title id="earnings-chart-title">Monthly earnings by category</title>
          <desc id="earnings-chart-desc">{describe}</desc>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y(t)}
                y2={y(t)}
                stroke="#e2e8f0"
                strokeWidth={1}
              />
              <text x={padLeft - 8} y={y(t) + 4} textAnchor="end" fontSize={11} fill="#64748b">
                {compactMoney(t)}
              </text>
            </g>
          ))}
          {shown.map((m, i) => {
            const x = padLeft + i * slot + (slot - barWidth) / 2;
            let cursor = 0;
            const monthTotal = EARNINGS_CATEGORIES.reduce((s, c) => s + Math.max(0, m[centsKey(c)]), 0);
            return (
              <g key={m.month}>
                <title>
                  {`${monthLabel(m.month, "long")}: ${money(m.totalCents)}`}
                </title>
                {EARNINGS_CATEGORIES.map((c) => {
                  const cents = Math.max(0, m[centsKey(c)]);
                  if (cents <= 0) return null;
                  const top = y(cursor + cents);
                  const bottom = y(cursor);
                  cursor += cents;
                  return (
                    <rect
                      key={c}
                      x={x}
                      y={top}
                      width={barWidth}
                      height={Math.max(0, bottom - top)}
                      fill={CATEGORY_COLORS[c]}
                    >
                      <title>{`${EARNINGS_CATEGORY_LABELS[c]}: ${money(cents)}`}</title>
                    </rect>
                  );
                })}
                {monthTotal === 0 ? (
                  <rect x={x} y={y(0) - 1} width={barWidth} height={1} fill="#cbd5e1" />
                ) : null}
                <text
                  x={x + barWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#475569"
                >
                  {monthLabel(m.month)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600" aria-label="Legend">
        {EARNINGS_CATEGORIES.map((c) => (
          <li key={c} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: CATEGORY_COLORS[c] }}
            />
            {EARNINGS_CATEGORY_LABELS[c]}
          </li>
        ))}
      </ul>
    </section>
  );
}

function compactMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 10_000) return `$${Math.round(dollars / 1000)}k`;
  if (dollars >= 1000) return `$${(dollars / 1000).toFixed(1)}k`;
  return `$${Math.round(dollars)}`;
}

function TopAsins({
  all,
  last12,
  money,
}: {
  all: AsinRow[];
  last12: AsinRow[];
  money: (c: number) => string;
}) {
  const [period, setPeriod] = useState<"all" | "12m">(last12.length > 0 ? "12m" : "all");
  const rows = period === "all" ? all : last12;
  if (all.length === 0 && last12.length === 0) return null;

  const toggle = (value: "all" | "12m", label: string) => (
    <button
      type="button"
      onClick={() => setPeriod(value)}
      aria-pressed={period === value}
      className={[
        "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
        period === value ? "bg-[#f97316] text-white shadow-sm" : "text-slate-600 hover:bg-slate-100",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Top products</p>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5" role="group" aria-label="Period">
          {toggle("all", "All time")}
          {toggle("12m", "Last 12 months")}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nothing synced for this period yet.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                <th className="py-2 pr-3 font-semibold">#</th>
                <th className="py-2 pr-3 font-semibold">Product</th>
                <th className="py-2 pr-3 font-semibold text-right">Earned</th>
                <th className="py-2 pr-3 font-semibold text-right">Units</th>
                <th className="py-2 font-semibold text-right">Orders</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.period}-${r.asin}`} className="border-b border-slate-100 align-top">
                  <td className="py-2 pr-3 tabular-nums text-slate-500">{r.rank}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-start gap-3">
                      {r.imageUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={r.imageUrl}
                          alt=""
                          loading="lazy"
                          className="h-10 w-10 flex-none rounded border border-slate-200 bg-white object-contain"
                        />
                      ) : (
                        <span className="h-10 w-10 flex-none rounded border border-dashed border-slate-200 bg-slate-50" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <a
                          href={`https://www.${r.marketplace}/dp/${r.asin}`}
                          target="_blank"
                          rel="noreferrer"
                          className="line-clamp-2 font-medium text-slate-900 hover:text-[#f97316]"
                        >
                          {r.title ?? r.asin}
                        </a>
                        <p className="mt-0.5 font-mono text-xs text-slate-500">
                          {r.asin} <span className="font-sans text-slate-400">on {r.marketplace}</span>
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold tabular-nums text-slate-900">
                    {money(r.amountCents)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-700">{r.units.toLocaleString()}</td>
                  <td className="py-2 text-right tabular-nums text-slate-700">{r.orders.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function EmptyState({ migrationPending }: { migrationPending: boolean }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-8 shadow-sm">
      <h2 className="text-xl font-semibold text-slate-900">Nothing synced yet</h2>
      {migrationPending ? (
        <p className="mt-2 text-sm text-slate-600">
          The earnings data store is being set up. Check back shortly.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-slate-600">
            Your earnings live in the desktop app. Push a copy here and this page (and your phone)
            will show your monthly totals and top products.
          </p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
            <li>Open the Influencer Butler desktop app and sign in.</li>
            <li>
              In the desktop app&apos;s <strong>Earnings Intelligence</strong> workspace, click{" "}
              <strong>Sync to web</strong>.
            </li>
            <li>Refresh this page. Sync again whenever you want fresh numbers.</li>
          </ol>
        </>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <Link
          href="/help/tutorials/earnings-intelligence"
          className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          Read the tutorial
        </Link>
      </div>
    </section>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200" />
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl border border-slate-200 bg-white" />
    </div>
  );
}
