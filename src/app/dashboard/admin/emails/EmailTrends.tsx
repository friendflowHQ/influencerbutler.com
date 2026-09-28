"use client";

// Drop-in "over time" reporting panel used at every level of the email funnel:
// aggregate (Overview), per-sequence (prefix), per-step / per-campaign
// (category), and per-newsletter-issue (broadcastId). Fetches the timeseries
// endpoint for its scope and renders a row of sparkline metric cards plus a
// combined multi-line trend chart. Pass `days` to follow a parent's window
// selector (hides the built-in toggle); otherwise it owns its own 7/30/90.

import { useEffect, useState } from "react";
import EmailSparkline from "./EmailSparkline";
import EmailTrendChart, { SERIES, type SeriesKey, type TrendPoint } from "./EmailTrendChart";

type Totals = Record<SeriesKey, number>;

type TimeseriesResponse = {
  days: number;
  from: string;
  to: string;
  points: TrendPoint[];
  totals: Totals;
  prevTotals: Totals;
  truncated?: boolean;
  migrationPending?: boolean;
};

// Order metrics show in, both as cards and as chart lines. Sends leads (it is
// the filled area); opened/clicked are the engagement payoff; delivered/bounced
// round out deliverability.
const METRICS: SeriesKey[] = ["sent", "delivered", "opened", "clicked", "bounced"];
const CHART_SERIES: SeriesKey[] = ["sent", "opened", "clicked"];

/** Percent-change badge vs the prior equal-length window, Growth-card style. */
function delta(current: number, previous: number): { arrow: string; label: string; tone: string } | null {
  if (previous <= 0) {
    if (current <= 0) return null;
    return { arrow: "↑", label: "new", tone: "text-emerald-600" };
  }
  const changePct = Math.round(((current - previous) / previous) * 100);
  if (changePct === 0) return { arrow: "-", label: "flat", tone: "text-slate-400" };
  if (changePct > 0) return { arrow: "↑", label: `${changePct}%`, tone: "text-emerald-600" };
  return { arrow: "↓", label: `${Math.abs(changePct)}%`, tone: "text-rose-600" };
}

export default function EmailTrends(props: {
  category?: string;
  prefix?: string;
  broadcastId?: string;
  funnel?: string;
  days?: number; // when set, follows the parent window and hides the inner toggle
  title?: string;
}) {
  const { category, prefix, broadcastId, funnel, days: controlledDays, title } = props;
  const [ownDays, setOwnDays] = useState(30);
  const days = controlledDays ?? ownDays;

  const [data, setData] = useState<TimeseriesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ days: String(days) });
        if (category) params.set("category", category);
        else if (prefix) params.set("prefix", prefix);
        else if (broadcastId) params.set("broadcastId", broadcastId);
        else if (funnel) params.set("funnel", funnel);
        const res = await fetch(`/api/admin/emails/timeseries?${params}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setData(null);
          return;
        }
        const json = (await res.json()) as TimeseriesResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, prefix, broadcastId, funnel, days]);

  const hasSends = Boolean(data && data.totals.sent > 0);

  return (
    <div>
      {/* Header row: optional title + the built-in window toggle (only when
          this panel owns its own window, i.e. no controlled `days`). */}
      {title || controlledDays == null ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {title ? (
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
          ) : (
            <span />
          )}
          {controlledDays == null ? (
            <div className="flex gap-1">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setOwnDays(d)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                    days === d
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="mt-3 h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      ) : data?.migrationPending ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The email_sends table is missing, so no trend data is available yet.
        </div>
      ) : !hasSends ? (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
          No sends recorded in the last {days} days.
        </div>
      ) : (
        <>
          {/* Metric cards with sparklines */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {METRICS.map((key) => {
              const total = data!.totals[key];
              const d = delta(total, data!.prevTotals[key]);
              const sparkData = data!.points.map((p) => p[key]);
              const { label, color } = SERIES[key];
              return (
                <div key={key} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-2xl font-bold text-slate-900 tabular-nums">
                      {total.toLocaleString("en-US")}
                    </p>
                    {d ? (
                      <p className={`text-xs font-semibold ${d.tone}`} title="vs the prior window">
                        {d.arrow} {d.label}
                      </p>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
                  {sparkData.some((v) => v > 0) ? (
                    <div className="mt-2">
                      <EmailSparkline data={sparkData} stroke={color} />
                    </div>
                  ) : (
                    <div className="mt-2 h-9" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Combined trend chart + legend */}
          <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex flex-wrap gap-3">
              {CHART_SERIES.map((key) => (
                <span key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: SERIES[key].color }}
                  />
                  {SERIES[key].label}
                </span>
              ))}
            </div>
            <EmailTrendChart points={data!.points} series={CHART_SERIES} />
          </div>

          {data!.truncated ? (
            <p className="mt-2 text-xs text-amber-600">
              Showing a partial sample: this scope has more sends than the chart pages in.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
