"use client";

import { useMemo } from "react";
import { formatUsdFromCents } from "@/lib/affiliates";

// Pure-SVG grouped bar chart for monthly affiliate earnings. Three series per
// month: gross referred revenue, full affiliate earnings, and the top-up we
// owe. No chart library (matches EarningsSparkline.tsx in the affiliate portal).

export type MonthlyBucket = {
  month: string; // YYYY-MM
  grossCents: number;
  lsPaidCents: number;
  owedCents: number;
  earnedCents: number;
  orderCount: number;
};

const SERIES = [
  { key: "grossCents", label: "Referred revenue", color: "#6366f1" },
  { key: "earnedCents", label: "Affiliate earnings", color: "#8b5cf6" },
  { key: "owedCents", label: "You owe (top-up)", color: "#f97316" },
] as const;

const VIEW_W = 760;
const VIEW_H = 280;
const PAD_L = 16;
const PAD_R = 16;
const PAD_T = 16;
const PAD_B = 34;

function shortMonth(yyyymm: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(yyyymm);
  if (!m) return yyyymm;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const idx = Number(m[2]) - 1;
  return `${names[idx] ?? m[2]} ${m[1].slice(2)}`;
}

export default function MonthlyEarningsChart({ data }: { data: MonthlyBucket[] }) {
  const { max, plotH, groupW } = useMemo(() => {
    const values: number[] = [];
    for (const d of data) {
      values.push(d.grossCents, d.earnedCents, d.owedCents);
    }
    const maxVal = Math.max(1, ...values);
    const pw = VIEW_W - PAD_L - PAD_R;
    const ph = VIEW_H - PAD_T - PAD_B;
    return { max: maxVal, plotH: ph, groupW: pw / Math.max(1, data.length) };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
        No earnings in this range yet.
      </div>
    );
  }

  const baseY = PAD_T + plotH;
  // Show a label under every month, or every other when the range is long.
  const labelEvery = data.length > 14 ? 2 : 1;
  const barGap = 2;
  const barW = Math.max(2, (groupW - barGap * (SERIES.length + 1)) / SERIES.length);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-4">
        {SERIES.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="w-full"
          role="img"
          aria-label="Monthly affiliate earnings"
        >
          {/* baseline */}
          <line x1={PAD_L} y1={baseY} x2={VIEW_W - PAD_R} y2={baseY} stroke="#e2e8f0" strokeWidth={1} />
          {data.map((d, i) => {
            const gx = PAD_L + i * groupW;
            return (
              <g key={d.month}>
                {SERIES.map((s, si) => {
                  const value = d[s.key] as number;
                  const h = (value / max) * plotH;
                  const x = gx + barGap + si * (barW + barGap);
                  const y = baseY - h;
                  return (
                    <rect key={s.key} x={x} y={y} width={barW} height={h} rx={1.5} fill={s.color}>
                      <title>
                        {shortMonth(d.month)} - {s.label}: {formatUsdFromCents(value)}
                        {s.key === "owedCents" ? ` (${d.orderCount} orders)` : ""}
                      </title>
                    </rect>
                  );
                })}
                {i % labelEvery === 0 ? (
                  <text
                    x={gx + groupW / 2}
                    y={VIEW_H - 12}
                    textAnchor="middle"
                    className="fill-slate-400"
                    style={{ fontSize: "10px" }}
                  >
                    {shortMonth(d.month)}
                  </text>
                ) : null}
              </g>
            );
          })}
          <text x={PAD_L} y={PAD_T - 4} className="fill-slate-400" style={{ fontSize: "10px" }}>
            max {formatUsdFromCents(max)}
          </text>
        </svg>
      </div>
    </div>
  );
}
