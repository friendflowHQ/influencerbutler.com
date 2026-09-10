"use client";

// Tiny non-interactive area+line sparkline for the email metric cards. Ported
// from the Growth dashboard's Sparkline so the Emails page reads the same, kept
// local to the emails folder to avoid cross-folder coupling.

export default function EmailSparkline({
  data,
  stroke = "#6366f1",
  fillOpacity = 0.16,
}: {
  data: number[];
  stroke?: string;
  fillOpacity?: number;
}) {
  if (data.length < 2) return null;

  const WIDTH = 120;
  const HEIGHT = 36;
  const max = Math.max(1, ...data);
  const step = WIDTH / (data.length - 1);

  const points = data.map((v, i) => ({
    x: step * i,
    y: HEIGHT - (v / max) * HEIGHT,
  }));
  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");
  const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-9 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path d={area} fill={stroke} fillOpacity={fillOpacity} />
      <path
        d={line}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
