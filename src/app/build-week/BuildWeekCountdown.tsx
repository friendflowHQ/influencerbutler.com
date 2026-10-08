"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown to the NEXT Build Week milestone (ideas open, submissions
 * close, voting closes, build starts, build deadline). The milestones and every
 * label come from the server component so the page works in all three locales.
 *
 * Renders a stable placeholder on the server and first client paint (no
 * hydration mismatch), then ticks once mounted. After the last milestone it
 * shows the "ended" message instead.
 */

type Milestone = { key: string; at: string };
type Props = {
  milestones: Milestone[];
  labels: Record<string, string>;
  units: { days: string; hours: string; minutes: string; seconds: string };
  aria: string;
  done: string;
};

function nextOf(milestones: Milestone[], now: number): Milestone | null {
  for (const m of milestones) {
    if (new Date(m.at).getTime() > now) return m;
  }
  return null;
}

function parts(target: number, now: number) {
  const total = Math.max(0, Math.floor((target - now) / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export default function BuildWeekCountdown({ milestones, labels, units, aria, done }: Props) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    // Start on the next frame so server HTML and the first client paint match.
    const frameId = requestAnimationFrame(() => {
      setNow(Date.now());
      intervalId = setInterval(() => setNow(Date.now()), 1000);
    });
    return () => {
      cancelAnimationFrame(frameId);
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const next = now === null ? milestones[0] ?? null : nextOf(milestones, now);

  if (now !== null && !next) {
    return <p className="text-sm font-semibold text-slate-700">{done}</p>;
  }

  const p = now !== null && next ? parts(new Date(next.at).getTime(), now) : null;
  const cells: Array<{ key: keyof typeof units; value: number | null }> = [
    { key: "days", value: p ? p.days : null },
    { key: "hours", value: p ? p.hours : null },
    { key: "minutes", value: p ? p.minutes : null },
    { key: "seconds", value: p ? p.seconds : null },
  ];

  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-orange-800">
        {next ? labels[next.key] : ""}
      </p>
      <div className="mt-2 flex items-center gap-2 sm:gap-3" role="timer" aria-label={aria}>
        {cells.map((c) => (
          <div
            key={c.key}
            className="flex min-w-[3.5rem] flex-col items-center rounded-xl border border-orange-200 bg-white px-2.5 py-2 sm:min-w-[4rem]"
          >
            <span className="font-mono text-2xl font-bold tabular-nums text-slate-900 sm:text-3xl">
              {c.value === null ? "--" : String(c.value).padStart(2, "0")}
            </span>
            <span className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-slate-600">
              {units[c.key]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
