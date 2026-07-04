"use client";

// Tiny non-interactive SVG sparkline for metric tiles.

const WIDTH = 120;
const HEIGHT = 36;
const PAD = 3;

export default function Sparkline({
  data,
  stroke = "#6366f1",
  fillOpacity = 0.15,
}: {
  data: number[];
  stroke?: string;
  fillOpacity?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(1, ...data);
  const innerW = WIDTH - PAD * 2;
  const innerH = HEIGHT - PAD * 2;
  const step = innerW / (data.length - 1);

  const points = data.map((v, i) => ({
    x: PAD + step * i,
    y: PAD + innerH - (v / max) * innerH,
  }));
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const baseY = PAD + innerH;
  const area = `${line} L${points[points.length - 1].x.toFixed(1)},${baseY} L${points[0].x.toFixed(1)},${baseY} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="none"
      className="h-9 w-full"
      aria-hidden
    >
      <path d={area} fill={stroke} opacity={fillOpacity} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
