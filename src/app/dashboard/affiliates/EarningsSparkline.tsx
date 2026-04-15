"use client";

import { useMemo, useRef, useState } from "react";
import type { AffiliateDailyEarning } from "@/lib/affiliates";
import { formatUsdFromCents } from "@/lib/affiliates";

type Props = {
  data: AffiliateDailyEarning[];
};

const WIDTH = 720;
const HEIGHT = 200;
const PAD_X = 12;
const PAD_Y = 16;

function formatShortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function EarningsSparkline({ data }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { points, maxCents, totalCents, areaPath, linePath } = useMemo(() => {
    if (data.length === 0) {
      return {
        points: [] as Array<{ x: number; y: number }>,
        maxCents: 0,
        totalCents: 0,
        areaPath: "",
        linePath: "",
      };
    }
    const maxCents = Math.max(1, ...data.map((d) => d.earningsCents));
    const totalCents = data.reduce((sum, d) => sum + d.earningsCents, 0);
    const innerW = WIDTH - PAD_X * 2;
    const innerH = HEIGHT - PAD_Y * 2;
    const step = data.length > 1 ? innerW / (data.length - 1) : 0;

    const points = data.map((d, i) => {
      const x = PAD_X + step * i;
      const y = PAD_Y + innerH - (d.earningsCents / maxCents) * innerH;
      return { x, y };
    });

    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(" ");

    const baseY = PAD_Y + innerH;
    const areaPath =
      points.length > 0
        ? `${linePath} L${points[points.length - 1].x.toFixed(2)},${baseY} L${points[0].x.toFixed(2)},${baseY} Z`
        : "";

    return { points, maxCents, totalCents, areaPath, linePath };
  }, [data]);

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const svgX = ratio * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - svgX);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = i;
      }
    }
    setHoverIdx(nearest);
  };

  const handleLeave = () => setHoverIdx(null);

  if (data.length === 0) {
    return null;
  }

  const firstDate = data[0]?.date;
  const lastDate = data[data.length - 1]?.date;
  const active = hoverIdx !== null ? data[hoverIdx] : null;
  const activePoint = hoverIdx !== null ? points[hoverIdx] : null;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Earnings trend
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Last 90 days — {formatUsdFromCents(totalCents)} in commissions.
          </p>
        </div>
        <p className="text-xs text-slate-400">
          Peak day: {formatUsdFromCents(maxCents)}
        </p>
      </div>

      <div className="relative mt-4">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          className="h-48 w-full"
          onMouseMove={handleMove}
          onMouseLeave={handleLeave}
          role="img"
          aria-label="Daily affiliate earnings over the last 90 days"
        >
          <defs>
            <linearGradient id="affiliate-sparkline-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Subtle horizontal gridline at the halfway mark */}
          <line
            x1={PAD_X}
            x2={WIDTH - PAD_X}
            y1={PAD_Y + (HEIGHT - PAD_Y * 2) / 2}
            y2={PAD_Y + (HEIGHT - PAD_Y * 2) / 2}
            stroke="#e2e8f0"
            strokeDasharray="3 4"
            strokeWidth={1}
          />

          {areaPath ? <path d={areaPath} fill="url(#affiliate-sparkline-fill)" /> : null}
          {linePath ? (
            <path
              d={linePath}
              fill="none"
              stroke="#f97316"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null}

          {activePoint ? (
            <>
              <line
                x1={activePoint.x}
                x2={activePoint.x}
                y1={PAD_Y}
                y2={HEIGHT - PAD_Y}
                stroke="#f97316"
                strokeOpacity="0.35"
                strokeWidth={1}
              />
              <circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={4}
                fill="#ffffff"
                stroke="#f97316"
                strokeWidth={2}
              />
            </>
          ) : null}
        </svg>

        {active && activePoint ? (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs shadow-sm"
            style={{
              left: `${(activePoint.x / WIDTH) * 100}%`,
              top: `${(activePoint.y / HEIGHT) * 100}%`,
              marginTop: "-8px",
            }}
          >
            <p className="font-semibold text-slate-900">
              {formatUsdFromCents(active.earningsCents)}
            </p>
            <p className="text-slate-500">{formatShortDate(active.date)}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-2 flex justify-between text-[11px] uppercase tracking-wider text-slate-400">
        <span>{firstDate ? formatShortDate(firstDate) : ""}</span>
        <span>{lastDate ? formatShortDate(lastDate) : ""}</span>
      </div>
    </section>
  );
}
