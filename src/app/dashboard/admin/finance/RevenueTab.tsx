"use client";

// Revenue tab: recognition buckets + a collected-vs-earned series with a
// day / week / month granularity toggle. Bars are plain CSS (no chart lib).

import { useCallback, useEffect, useState } from "react";
import { usd, shortDate } from "./format";

type Granularity = "day" | "week" | "month";

type RevenueResponse = {
  ok?: boolean;
  migrationPending?: boolean;
  error?: string;
  granularity?: Granularity;
  buckets?: {
    collectedCents: number;
    earnedCents: number;
    deferredCents: number;
    releasableCents: number;
    heldCents: number;
    orderCount: number;
  };
  series?: { bucket: string; collectedCents: number; earnedCents: number }[];
  refundHoldDays?: number;
};

export default function RevenueTab() {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/revenue?granularity=${granularity}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as RevenueResponse;
      if (!res.ok || json.migrationPending) {
        setError(json.error ?? (json.migrationPending ? "Migration pending." : `Failed (${res.status})`));
        return;
      }
      setData(json);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [granularity]);

  useEffect(() => {
    void load();
  }, [load]);

  const buckets = data?.buckets;
  const series = data?.series ?? [];
  const maxValue = Math.max(1, ...series.map((p) => Math.max(p.collectedCents, p.earnedCents)));

  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Money earns out daily over each subscription&apos;s period (annual: 365 days, monthly: 30),
          and only counts as releasable once past the {data?.refundHoldDays ?? 30}-day refund
          window.
        </p>
        <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
          {(["day", "week", "month"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setGranularity(g)}
              className={[
                "rounded-md px-3 py-1 text-xs font-medium capitalize",
                granularity === g ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
              ].join(" ")}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {buckets ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: "Collected", value: buckets.collectedCents, tone: "#0f172a" },
            { label: "Earned", value: buckets.earnedCents, tone: "#0f172a" },
            { label: "Deferred", value: buckets.deferredCents, tone: "#d97706" },
            { label: "Releasable", value: buckets.releasableCents, tone: "#059669" },
            { label: "In refund hold", value: buckets.heldCents, tone: "#64748b" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className="mt-1 text-xl font-semibold" style={{ color: c.tone }}>
                {usd(c.value)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {series.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-4 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Collected
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Earned
            </span>
          </div>
          <div className="flex items-end gap-1 overflow-x-auto" style={{ height: 180 }}>
            {series.map((p) => (
              <div
                key={p.bucket}
                className="group relative flex min-w-[14px] flex-1 items-end gap-0.5"
                title={`${shortDate(p.bucket)}: collected ${usd(p.collectedCents)}, earned ${usd(p.earnedCents)}`}
              >
                <div
                  className="w-1/2 rounded-t bg-indigo-500/80"
                  style={{ height: `${Math.max(2, (p.collectedCents / maxValue) * 170)}px` }}
                />
                <div
                  className="w-1/2 rounded-t bg-emerald-500/80"
                  style={{ height: `${Math.max(2, (p.earnedCents / maxValue) * 170)}px` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-slate-400">
            <span>{shortDate(series[0]?.bucket)}</span>
            <span>{shortDate(series[series.length - 1]?.bucket)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
