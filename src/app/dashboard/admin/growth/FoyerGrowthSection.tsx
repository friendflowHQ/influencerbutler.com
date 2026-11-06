"use client";

// Growth page: Foyer commerce tiles for the selected month (our commission
// with a daily sparkline, sales processed, creators selling, sales count).
// Hidden for staff without finance access or when the links service is not
// configured, so it never breaks the rest of the page.

import { useEffect, useState } from "react";
import MetricTile from "./MetricTile";

type Pair = { current: number; previous: number | null };
type FoyerResponse = {
  commission?: Pair & { series: number[] };
  gross?: Pair;
  sellers?: Pair;
  sales?: Pair;
  error?: string;
};

export default function FoyerGrowthSection({ month }: { month: string }) {
  // Keyed by month so switching months shows the skeleton without resetting state in the effect.
  const [loaded, setLoaded] = useState<{ month: string; data: FoyerResponse } | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/growth/foyer?month=${encodeURIComponent(month)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) {
          setHidden(true);
          return;
        }
        setHidden(false);
        setLoaded({ month, data: (await res.json()) as FoyerResponse });
      })
      .catch(() => alive && setHidden(true));
    return () => {
      alive = false;
    };
  }, [month]);

  if (hidden) return null;
  const data = loaded && loaded.month === month ? loaded.data : null;

  return (
    <section className="mt-10">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">Foyer sales</h2>
      <p className="mt-1 text-xs text-slate-500">Our 5% on creators&apos; Foyer digital product and membership sales. Details in Finance, Foyer commission.</p>
      {!data ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
          ))}
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MetricTile
            label="Foyer commission"
            unit="cents"
            current={data.commission?.current ?? null}
            previous={data.commission?.previous ?? null}
            series={data.commission?.series ?? null}
            accent="#059669"
          />
          <MetricTile label="Foyer sales processed" unit="cents" current={data.gross?.current ?? null} previous={data.gross?.previous ?? null} series={null} accent="#0f172a" />
          <MetricTile label="Creators selling" unit="count" current={data.sellers?.current ?? null} previous={data.sellers?.previous ?? null} series={null} accent="#f97316" />
          <MetricTile label="Foyer sales" unit="count" current={data.sales?.current ?? null} previous={data.sales?.previous ?? null} series={null} accent="#6366f1" />
        </div>
      )}
    </section>
  );
}
