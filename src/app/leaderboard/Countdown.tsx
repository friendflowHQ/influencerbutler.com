"use client";

import { useEffect, useState } from "react";

/**
 * Live countdown to the challenge deadline. The target is passed as an ISO
 * string straight from content/leaderboard.json (e.g. the October 1 cutoff in
 * Mountain Time), so editing the data file is enough to move the clock.
 *
 * Renders a stable placeholder on the server and first client paint to avoid a
 * hydration mismatch, then ticks once mounted.
 */

type Remaining = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
};

function remainingFrom(target: number): Remaining {
  const diff = target - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  const seconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
    done: false,
  };
}

const UNITS: Array<{ key: keyof Omit<Remaining, "done">; label: string }> = [
  { key: "days", label: "Days" },
  { key: "hours", label: "Hours" },
  { key: "minutes", label: "Min" },
  { key: "seconds", label: "Sec" },
];

export default function Countdown({ deadline }: { deadline: string }) {
  const target = new Date(deadline).getTime();
  const [remaining, setRemaining] = useState<Remaining | null>(null);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | undefined;
    // Defer the first update off the synchronous effect body: it keeps the
    // server and first client paint identical (placeholder) so hydration
    // matches, then the clock starts on the next frame.
    const frameId = requestAnimationFrame(() => {
      setRemaining(remainingFrom(target));
      intervalId = setInterval(() => setRemaining(remainingFrom(target)), 1000);
    });
    return () => {
      cancelAnimationFrame(frameId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [target]);

  if (remaining?.done) {
    return (
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/90">
        Challenge closed
      </p>
    );
  }

  return (
    <div
      className="flex items-center gap-2 sm:gap-3"
      role="timer"
      aria-label="Time remaining in the affiliate challenge"
    >
      {UNITS.map((unit) => {
        const value = remaining ? remaining[unit.key] : null;
        return (
          <div
            key={unit.key}
            className="flex min-w-[3.25rem] flex-col items-center rounded-xl bg-white/15 px-2.5 py-2 backdrop-blur sm:min-w-[3.75rem]"
          >
            <span className="font-mono text-2xl font-bold tabular-nums text-white sm:text-3xl">
              {value === null ? "--" : String(value).padStart(2, "0")}
            </span>
            <span className="mt-0.5 text-[0.6rem] font-semibold uppercase tracking-wider text-white/80">
              {unit.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
