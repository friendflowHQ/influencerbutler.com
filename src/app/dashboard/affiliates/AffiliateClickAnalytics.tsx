"use client";

import { useEffect, useMemo, useState } from "react";
import { labelForSource } from "@/lib/affiliate-clicks";

type Stats = {
  total: number;
  prevTotal: number;
  bySource: { source: string; count: number }[];
  byReferrer: { host: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDay: { date: string; count: number }[];
};

type Timeframe = "7d" | "30d" | "90d" | "all";

const TIMEFRAMES: { value: Timeframe; label: string; days: number | null }[] = [
  { value: "7d", label: "7 days", days: 7 },
  { value: "30d", label: "30 days", days: 30 },
  { value: "90d", label: "90 days", days: 90 },
  { value: "all", label: "All time", days: null },
];

const EMPTY_STATS: Stats = {
  total: 0,
  prevTotal: 0,
  bySource: [],
  byReferrer: [],
  byCountry: [],
  byDay: [],
};

function windowForTimeframe(tf: Timeframe): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString();
  const entry = TIMEFRAMES.find((t) => t.value === tf);
  if (!entry || entry.days === null) {
    // "All time": go back ~5 years - the table didn't exist before then.
    const from = new Date(now.getTime() - 5 * 365 * 24 * 60 * 60 * 1000).toISOString();
    return { from, to };
  }
  const from = new Date(now.getTime() - entry.days * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

function formatPct(delta: number): string {
  const rounded = Math.round(delta * 10) / 10;
  if (rounded > 0) return `+${rounded}%`;
  return `${rounded}%`;
}

function regionDisplayName(code: string): string {
  try {
    const dn = new Intl.DisplayNames(["en"], { type: "region" });
    return dn.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export default function AffiliateClickAnalytics({
  endpoint = "/api/affiliates/clicks",
}: {
  /** Data source. Defaults to the caller's own clicks; the admin "view as"
   *  dashboard points this at an affiliate-scoped admin endpoint. */
  endpoint?: string;
} = {}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("30d");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const load = async () => {
      try {
        const { from, to } = windowForTimeframe(timeframe);
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ from, to }),
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setError(`Failed to load (${res.status})`);
          return;
        }
        const data = (await res.json()) as Stats;
        if (!cancelled) setStats(data);
      } catch (err) {
        console.error("click stats fetch failed", err);
        if (!cancelled) setError("Network error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [timeframe, endpoint]);

  const data = stats ?? EMPTY_STATS;
  const deltaPct =
    data.prevTotal > 0
      ? ((data.total - data.prevTotal) / data.prevTotal) * 100
      : data.total > 0
      ? 100
      : 0;

  const sourceTop = useMemo(() => {
    const total = data.bySource.reduce((s, r) => s + r.count, 0);
    if (total === 0) return { total, rows: [] as { source: string; count: number; pct: number }[] };
    return {
      total,
      rows: data.bySource.map((r) => ({
        ...r,
        pct: (r.count / total) * 100,
      })),
    };
  }, [data.bySource]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Branded link clicks
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Clicks on your <span className="font-mono">?code=</span> share link, bucketed by source.
            LS-tracked link clicks are reported separately by Lemon Squeezy.
          </p>
        </div>
        <TimeframePills value={timeframe} onChange={setTimeframe} />
      </div>

      {error ? (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total clicks</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">
            {loading ? <Skeleton width="w-16" /> : data.total.toLocaleString()}
          </p>
          {!loading && (data.total > 0 || data.prevTotal > 0) ? (
            <p
              className={`mt-1 text-xs font-medium ${
                deltaPct > 0 ? "text-emerald-700" : deltaPct < 0 ? "text-rose-700" : "text-slate-500"
              }`}
            >
              {formatPct(deltaPct)} vs. previous {TIMEFRAMES.find((t) => t.value === timeframe)?.label}
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-500">No data yet.</p>
          )}
        </article>

        <article className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:col-span-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Daily clicks</p>
          <ClicksBarChart data={data.byDay} timeframe={timeframe} loading={loading} />
        </article>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownBars
          title="Where they came from"
          empty="No clicks tracked yet. Share your link to start seeing breakdowns."
          rows={sourceTop.rows.map((r) => ({
            key: r.source,
            label: labelForSource(r.source),
            count: r.count,
            pct: r.pct,
          }))}
          loading={loading}
        />

        <div className="space-y-4">
          <ListPanel
            title="Top referrers"
            empty="No referrer data yet."
            rows={data.byReferrer.map((r) => ({ label: r.host, count: r.count }))}
            loading={loading}
          />
          <ListPanel
            title="Top countries"
            empty="No country data yet."
            rows={data.byCountry.map((c) => ({
              label: regionDisplayName(c.country),
              count: c.count,
            }))}
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
}

function TimeframePills({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (v: Timeframe) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Timeframe"
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 p-1 text-xs font-medium"
    >
      {TIMEFRAMES.map((tf) => {
        const active = tf.value === value;
        return (
          <button
            key={tf.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tf.value)}
            className={`rounded-full px-3 py-1 transition ${
              active
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            {tf.label}
          </button>
        );
      })}
    </div>
  );
}

function BreakdownBars({
  title,
  empty,
  rows,
  loading,
}: {
  title: string;
  empty: string;
  rows: { key: string; label: string; count: number; pct: number }[];
  loading: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {loading ? (
        <div className="mt-3 space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-7 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-medium text-slate-800">{r.label}</span>
                <span className="text-xs text-slate-500">
                  {r.count.toLocaleString()} ({Math.round(r.pct)}%)
                </span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-[#f97316]"
                  style={{ width: `${Math.max(2, r.pct)}%` }}
                  aria-hidden
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function ListPanel({
  title,
  empty,
  rows,
  loading,
}: {
  title: string;
  empty: string;
  rows: { label: string; count: number }[];
  loading: boolean;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      {loading ? (
        <div className="mt-3 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-1.5 text-sm">
          {rows.slice(0, 5).map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2">
              <span className="truncate text-slate-700">{r.label}</span>
              <span className="text-xs text-slate-500">{r.count.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function Skeleton({ width }: { width: string }) {
  return <span className={`inline-block h-7 ${width} animate-pulse rounded bg-slate-200 align-middle`} />;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Cap zero-filling for "All time" so we never render years of daily bars. */
const ALL_TIME_DENSIFY_CAP = 120;

/** UTC yyyy-mm-dd key, matching how the API buckets created_at (created_at.slice(0,10)). */
function utcDayKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function dayLabel(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Turn the API's sparse byDay (only days that had clicks) into a dense, ordered
 * series with a bucket for every day in the window - so a single day of clicks
 * still renders one bar, and gaps show as zero instead of collapsing.
 */
function buildDailySeries(
  byDay: { date: string; count: number }[],
  timeframe: Timeframe,
): { date: string; count: number }[] {
  const counts = new Map(byDay.map((d) => [d.date, d.count]));
  const todayMs = new Date(`${utcDayKey(Date.now())}T00:00:00.000Z`).getTime();
  const entry = TIMEFRAMES.find((t) => t.value === timeframe);

  let numDays: number;
  if (entry && entry.days !== null) {
    numDays = entry.days;
  } else {
    // "All time": span from the earliest click day to today (byDay is asc).
    if (byDay.length === 0) return [];
    const firstMs = new Date(`${byDay[0].date}T00:00:00.000Z`).getTime();
    const span = Math.floor((todayMs - firstMs) / DAY_MS) + 1;
    // Too wide to zero-fill sensibly: fall back to the sparse days as-is.
    if (span > ALL_TIME_DENSIFY_CAP) return byDay.map((d) => ({ ...d }));
    numDays = Math.max(1, span);
  }

  const out: { date: string; count: number }[] = [];
  for (let i = numDays - 1; i >= 0; i--) {
    const key = utcDayKey(todayMs - i * DAY_MS);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

function ClicksBarChart({
  data,
  timeframe,
  loading,
}: {
  data: { date: string; count: number }[];
  timeframe: Timeframe;
  loading: boolean;
}) {
  const series = useMemo(() => buildDailySeries(data, timeframe), [data, timeframe]);
  const max = useMemo(() => Math.max(1, ...series.map((d) => d.count)), [series]);
  const total = useMemo(() => series.reduce((s, d) => s + d.count, 0), [series]);

  if (loading) {
    return <div className="mt-3 h-24 animate-pulse rounded bg-slate-100" />;
  }

  if (series.length === 0 || total === 0) {
    return <p className="mt-3 text-sm text-slate-500">No clicks in this window.</p>;
  }

  return (
    <div className="mt-3">
      <div
        className="flex h-24 w-full items-end gap-px border-b border-slate-200"
        role="img"
        aria-label={`Daily clicks bar chart, peak ${max} on a single day`}
      >
        {series.map((d) => {
          const heightPct = d.count > 0 ? Math.max(8, (d.count / max) * 100) : 0;
          return (
            <div
              key={d.date}
              className="flex h-full flex-1 items-end"
              title={`${dayLabel(d.date)}: ${d.count.toLocaleString()} click${d.count === 1 ? "" : "s"}`}
            >
              <div
                className="w-full rounded-t-sm bg-[#f97316] transition-[height]"
                style={{ height: `${heightPct}%` }}
                aria-hidden
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>{dayLabel(series[0].date)}</span>
        <span>{dayLabel(series[series.length - 1].date)}</span>
      </div>
    </div>
  );
}
