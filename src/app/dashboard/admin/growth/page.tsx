"use client";

// Growth dashboard: glanceable "right now" strip, monthly goals with
// celebrations, our own metric tiles, Google Analytics, and the monthly
// growth checklist. Data arrives from four parallel admin APIs so a slow
// GA call never blocks the rest of the page.

import { useCallback, useEffect, useState } from "react";
import Confetti from "./Confetti";
import GaSection, { type GaResponse } from "./GaSection";
import GoalsSection from "./GoalsSection";
import ChecklistSection from "./ChecklistSection";
import MetricTile from "./MetricTile";
import {
  catalogEntry,
  currentMonthKey,
  formatMetricValue,
  monthLabel,
  shiftMonth,
  type CatalogEntry,
  type MetricSnapshot,
} from "./format";

type MetricsResponse = {
  month?: string;
  prevMonth?: string;
  migrationPending?: boolean;
  catalog?: CatalogEntry[];
  metrics?: Record<string, MetricSnapshot>;
  error?: string;
};

const TILE_ORDER: { key: string; accent: string }[] = [
  { key: "trial_clicks", accent: "#0ea5e9" },
  { key: "trials_started", accent: "#6366f1" },
  { key: "trial_conversions", accent: "#10b981" },
  { key: "new_subscriptions", accent: "#8b5cf6" },
  { key: "revenue_cents", accent: "#f59e0b" },
  { key: "affiliate_clicks", accent: "#f97316" },
  { key: "affiliate_signups", accent: "#f43f5e" },
  { key: "commission_paid_cents", accent: "#14b8a6" },
  { key: "commission_owed_cents", accent: "#ef4444" },
  { key: "testimonials", accent: "#eab308" },
  { key: "email_subscribers", accent: "#3b82f6" },
];

export default function AdminGrowthPage() {
  const [month, setMonth] = useState(currentMonthKey);
  const [forbidden, setForbidden] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
  const [gaLoading, setGaLoading] = useState(true);
  const [gaRefreshing, setGaRefreshing] = useState(false);
  const [ga, setGa] = useState<GaResponse | null>(null);
  const [confettiBursts, setConfettiBursts] = useState(0);

  const isCurrentMonth = month === currentMonthKey();

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/admin/growth/metrics?month=${month}`, { cache: "no-store" });
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      const json = (await res.json()) as MetricsResponse;
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setMetrics(json);
    } catch (err) {
      console.error(err);
      setFetchError("Network error. Please refresh.");
    } finally {
      setMetricsLoading(false);
    }
  }, [month]);

  const loadGa = useCallback(async (refresh = false) => {
    if (refresh) setGaRefreshing(true);
    try {
      const res = await fetch(`/api/admin/growth/ga${refresh ? "?refresh=1" : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      setGa((await res.json()) as GaResponse);
    } catch {
      // GA panel just stays in its previous state
    } finally {
      setGaLoading(false);
      setGaRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    void loadGa();
  }, [loadGa]);

  const celebrate = useCallback(() => setConfettiBursts((n) => n + 1), []);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  const m = metrics?.metrics ?? {};
  const catalog = metrics?.catalog ?? null;

  const strip: { label: string; value: string; live?: boolean; tone: string }[] = [
    {
      label: "On the site right now",
      value:
        ga?.configured && typeof ga.realtimeActiveUsers === "number"
          ? ga.realtimeActiveUsers.toLocaleString("en-US")
          : "-",
      live: Boolean(ga?.configured && typeof ga.realtimeActiveUsers === "number"),
      tone: "text-emerald-600",
    },
    {
      label: "Active subscribers",
      value: formatMetricValue("count", m.active_subscriptions?.current ?? null),
      tone: "text-indigo-600",
    },
    {
      label: "On trial",
      value: formatMetricValue("count", m.on_trial_subscriptions?.current ?? null),
      tone: "text-sky-600",
    },
    {
      label: isCurrentMonth ? "Revenue this month" : `Revenue in ${monthLabel(month)}`,
      value: formatMetricValue("cents", m.revenue_cents?.current ?? null),
      tone: "text-amber-600",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {confettiBursts > 0 ? <Confetti onDone={() => setConfettiBursts(0)} /> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Growth</h1>
          <p className="mt-1 text-sm text-slate-600">
            Your numbers, your goals, and what to do next - all on one page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((prev) => shiftMonth(prev, -1))}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50"
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="min-w-32 text-center text-sm font-semibold text-slate-800">
            {monthLabel(month)}
          </span>
          <button
            type="button"
            onClick={() => setMonth((prev) => shiftMonth(prev, 1))}
            disabled={isCurrentMonth}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {fetchError ? <p className="mt-8 text-rose-600">{fetchError}</p> : null}

      {/* Right now */}
      <section className="mt-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {strip.map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className={`flex items-center gap-2 text-3xl font-extrabold ${s.tone}`}>
                {metricsLoading && !s.live ? (
                  <span className="inline-block h-8 w-14 animate-pulse rounded bg-slate-100" />
                ) : (
                  s.value
                )}
                {s.live ? (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                ) : null}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      <GoalsSection month={month} catalog={catalog} onCelebrate={celebrate} />

      {/* Your numbers */}
      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
          Your numbers, {monthLabel(month)}
        </h2>
        {metrics?.migrationPending ? (
          <p className="mt-1 text-xs text-amber-700">
            Trial conversions need 20260704_trial_conversion_capture.sql applied in the Supabase
            SQL editor.
          </p>
        ) : null}
        {metricsLoading ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
            ))}
          </div>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {TILE_ORDER.map(({ key, accent }) => {
              const snap = m[key];
              if (!snap) return null;
              const entry = catalogEntry(catalog, key);
              return (
                <MetricTile
                  key={key}
                  label={entry.label}
                  unit={entry.unit}
                  current={snap.current}
                  previous={snap.previous}
                  series={snap.series}
                  accent={accent}
                />
              );
            })}
          </div>
        )}
      </section>

      <GaSection
        data={ga}
        loading={gaLoading}
        refreshing={gaRefreshing}
        onRefresh={() => void loadGa(true)}
      />

      <ChecklistSection month={month} isCurrentMonth={isCurrentMonth} onCelebrate={celebrate} />
    </div>
  );
}
