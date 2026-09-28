"use client";

// Pure-SVG multi-line trend chart for email engagement over time, following the
// Growth GaTrendChart pattern (title-tag tooltips, no chart library). Sends
// draws as a filled area+line; the other selected metrics overlay as lines.

export type TrendPoint = {
  date: string; // YYYY-MM-DD (UTC)
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

export type SeriesKey = "sent" | "delivered" | "opened" | "clicked" | "bounced";

// Shared palette + labels, exported so the metric cards use the same colors as
// the lines. Hex values (no design tokens) mirroring the table accents already
// on the page: opened indigo, clicked sky, plus violet/emerald/rose for the rest.
export const SERIES: Record<SeriesKey, { label: string; color: string }> = {
  sent: { label: "Sent", color: "#8b5cf6" },
  delivered: { label: "Delivered", color: "#10b981" },
  opened: { label: "Opened", color: "#6366f1" },
  clicked: { label: "Clicked", color: "#0ea5e9" },
  bounced: { label: "Bounced", color: "#f43f5e" },
};

const WIDTH = 760;
const HEIGHT = 220;
const PAD_X = 14;
const PAD_TOP = 18;
const PAD_BOTTOM = 26;

function shortDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${iso}T00:00:00Z`),
    );
  } catch {
    return iso;
  }
}

export default function EmailTrendChart({
  points,
  series = ["sent", "opened", "clicked"],
}: {
  points: TrendPoint[];
  series?: SeriesKey[];
}) {
  if (points.length < 2 || series.length === 0) return null;

  // Shared Y scale across every selected series so the lines are comparable.
  const max = Math.max(1, ...points.flatMap((p) => series.map((k) => p[k])));
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = innerW / (points.length - 1);
  const baseY = PAD_TOP + innerH;

  const xAt = (i: number) => PAD_X + step * i;
  const yAt = (v: number) => PAD_TOP + innerH - (v / max) * innerH;

  const pathFor = (key: SeriesKey) =>
    points
      .map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i).toFixed(1)},${yAt(p[key]).toFixed(1)}`)
      .join(" ");

  // Sends, when selected, gets a filled area under it for weight; the rest are
  // plain lines drawn on top.
  const areaKey: SeriesKey | null = series.includes("sent") ? "sent" : null;
  const areaPath = areaKey
    ? `${pathFor(areaKey)} L${xAt(points.length - 1).toFixed(1)},${baseY} L${xAt(0).toFixed(1)},${baseY} Z`
    : null;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label={`Email ${series.map((k) => SERIES[k].label.toLowerCase()).join(", ")} over ${points.length} days`}
    >
      <defs>
        <linearGradient id="email-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={SERIES.sent.color} stopOpacity="0.26" />
          <stop offset="100%" stopColor={SERIES.sent.color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* midline + peak label */}
      <line
        x1={PAD_X}
        x2={WIDTH - PAD_X}
        y1={PAD_TOP + innerH / 2}
        y2={PAD_TOP + innerH / 2}
        stroke="#e2e8f0"
        strokeDasharray="3 4"
        strokeWidth={1}
      />
      <text x={WIDTH - PAD_X} y={PAD_TOP - 6} textAnchor="end" fontSize={11} fill="#94a3b8">
        peak {max.toLocaleString("en-US")}
      </text>

      {areaPath ? <path d={areaPath} fill="url(#email-trend-fill)" /> : null}

      {series.map((key) => (
        <path
          key={key}
          d={pathFor(key)}
          fill="none"
          stroke={SERIES[key].color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* invisible hover strips with native tooltips */}
      {points.map((p, i) => (
        <rect
          key={p.date}
          x={xAt(i) - step / 2}
          y={PAD_TOP}
          width={step}
          height={innerH}
          fill="transparent"
        >
          <title>
            {`${shortDate(p.date)}: ` +
              series.map((k) => `${p[k].toLocaleString("en-US")} ${SERIES[k].label.toLowerCase()}`).join(", ")}
          </title>
        </rect>
      ))}

      <text x={PAD_X} y={HEIGHT - 8} fontSize={11} fill="#94a3b8">
        {shortDate(points[0].date)}
      </text>
      <text x={WIDTH - PAD_X} y={HEIGHT - 8} textAnchor="end" fontSize={11} fill="#94a3b8">
        {shortDate(points[points.length - 1].date)}
      </text>
    </svg>
  );
}
