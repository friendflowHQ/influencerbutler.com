"use client";

// Pure-SVG area chart for the GA 28-day users trend, following the
// MonthlyEarningsChart pattern (title-tag tooltips, no chart library).

export type GaTrendDay = { date: string; activeUsers: number; newUsers: number };

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

export default function GaTrendChart({ days }: { days: GaTrendDay[] }) {
  if (days.length < 2) return null;

  const max = Math.max(1, ...days.map((d) => d.activeUsers));
  const innerW = WIDTH - PAD_X * 2;
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const step = innerW / (days.length - 1);
  const baseY = PAD_TOP + innerH;

  const points = days.map((d, i) => ({
    x: PAD_X + step * i,
    y: PAD_TOP + innerH - (d.activeUsers / max) * innerH,
  }));
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${baseY} L${points[0].x.toFixed(1)},${baseY} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label="Daily active users over the last 28 days"
    >
      <defs>
        <linearGradient id="ga-trend-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* midline + max label */}
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

      <path d={area} fill="url(#ga-trend-fill)" />
      <path
        d={line}
        fill="none"
        stroke="#6366f1"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* invisible hover strips with native tooltips */}
      {days.map((d, i) => (
        <rect
          key={d.date}
          x={PAD_X + step * i - step / 2}
          y={PAD_TOP}
          width={step}
          height={innerH}
          fill="transparent"
        >
          <title>{`${shortDate(d.date)}: ${d.activeUsers.toLocaleString("en-US")} users, ${d.newUsers.toLocaleString("en-US")} new`}</title>
        </rect>
      ))}

      <text x={PAD_X} y={HEIGHT - 8} fontSize={11} fill="#94a3b8">
        {shortDate(days[0].date)}
      </text>
      <text x={WIDTH - PAD_X} y={HEIGHT - 8} textAnchor="end" fontSize={11} fill="#94a3b8">
        {shortDate(days[days.length - 1].date)}
      </text>
    </svg>
  );
}
