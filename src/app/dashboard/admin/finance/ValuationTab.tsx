"use client";

// Valuation tab: a rough internal estimate (ARR x revenue-multiple range),
// recomputed weekly by a Claude Code routine every Monday (see
// src/app/api/cron/valuation/route.ts) and refreshable on demand here.

import { useCallback, useEffect, useState } from "react";
import { usd, shortDate } from "./format";

type Snapshot = {
  snapshot_date: string;
  active_subscriptions: number;
  mrr_cents: number;
  arr_cents: number;
  monthly_growth_rate: number | null;
  multiple_low: number;
  multiple_base: number;
  multiple_high: number;
  valuation_low_cents: number;
  valuation_base_cents: number;
  valuation_high_cents: number;
  created_at: string;
};

type ValuationResponse = {
  ok?: boolean;
  migrationPending?: boolean;
  error?: string;
  latest?: Snapshot | null;
  history?: Snapshot[];
};

function StatCard({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: accent ?? "#0f172a" }}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function pct(fraction: number | null): string {
  if (fraction == null || !Number.isFinite(fraction)) return "n/a";
  const sign = fraction > 0 ? "+" : "";
  return `${sign}${(fraction * 100).toFixed(1)}%/mo`;
}

export default function ValuationTab() {
  const [data, setData] = useState<ValuationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [recomputing, setRecomputing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/valuation", { cache: "no-store" });
      const json = (await res.json()) as ValuationResponse;
      if (!res.ok && !json.migrationPending) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setData(json);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const recompute = useCallback(async () => {
    setRecomputing(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/finance/valuation/recompute", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string; migrationPending?: boolean };
      if (!res.ok || !json.ok) {
        setError(json.error ?? (json.migrationPending ? "Migration pending." : `Failed (${res.status})`));
        return;
      }
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setRecomputing(false);
    }
  }, [load]);

  if (loading) {
    return <p className="mt-6 text-sm text-slate-500">Loading...</p>;
  }

  if (data?.migrationPending) {
    return (
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
        <h2 className="text-lg font-semibold text-amber-900">Migration pending</h2>
        <p className="mt-2 text-sm text-amber-800">
          The valuation table has not been applied to production Supabase yet. Run
          supabase/migrations/20261002_valuation.sql against prod, then reload this page.
        </p>
      </div>
    );
  }

  const latest = data?.latest ?? null;
  const history = data?.history ?? [];
  const maxValuation = Math.max(1, ...history.map((h) => h.valuation_base_cents));

  return (
    <div className="mt-6 space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      {!latest ? (
        <p className="text-sm text-slate-500">
          No snapshot yet. Click &quot;Recompute now&quot; below, or wait for Monday&apos;s routine.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Conservative (2x ARR)"
              value={usd(latest.valuation_low_cents)}
              hint={`${latest.multiple_low}x trailing ARR`}
            />
            <StatCard
              label="Base case (3x ARR)"
              value={usd(latest.valuation_base_cents)}
              hint={`${latest.multiple_base}x trailing ARR`}
              accent="#4f46e5"
            />
            <StatCard
              label="Optimistic (4x ARR)"
              value={usd(latest.valuation_high_cents)}
              hint={`${latest.multiple_high}x trailing ARR`}
              accent="#059669"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="ARR" value={usd(latest.arr_cents)} />
            <StatCard label="MRR" value={usd(latest.mrr_cents)} />
            <StatCard label="Active subscriptions" value={String(latest.active_subscriptions)} />
            <StatCard label="Monthly growth" value={pct(latest.monthly_growth_rate)} hint="trailing 4 weeks" />
          </div>

          {history.length > 1 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Base-case valuation trend
              </p>
              <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 160 }}>
                {history.map((h) => (
                  <div
                    key={h.snapshot_date}
                    className="group relative flex min-w-[10px] flex-1 items-end"
                    title={`${shortDate(h.snapshot_date)}: ${usd(h.valuation_base_cents)}`}
                  >
                    <div
                      className="w-full rounded-t bg-indigo-500/80"
                      style={{ height: `${Math.max(2, (h.valuation_base_cents / maxValuation) * 150)}px` }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-slate-400">
                <span>{shortDate(history[0]?.snapshot_date)}</span>
                <span>{shortDate(history[history.length - 1]?.snapshot_date)}</span>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
            <p>
              Rough internal estimate only, not a formal valuation: active subscriptions x each
              plan&apos;s monthly price x 12, times a 2x-4x revenue-multiple range typical for a
              profitable, founder-run SaaS. Updated weekly by a scheduled Claude Code routine every
              Monday. Last updated {shortDate(latest.snapshot_date)}.
            </p>
            <button
              type="button"
              onClick={() => void recompute()}
              disabled={recomputing}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {recomputing ? "Recomputing..." : "Recompute now"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
