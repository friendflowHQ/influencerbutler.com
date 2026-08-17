"use client";

// Compact drip-schedule overview: the next ~10 weeks, each with its scheduled
// post count. Weeks with nothing queued show as amber "gap" chips so holes in
// the content calendar are visible at a glance. Pure derivation from the
// already-fetched post list; no extra requests.

import { useMemo } from "react";
import type { AdminBlogPost } from "./types";

const WEEKS_SHOWN = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfWeekUTC(iso: string): number {
  const d = new Date(`${iso}T00:00:00Z`);
  const dow = d.getUTCDay(); // 0 = Sunday
  const monday = (dow + 6) % 7; // days since Monday
  return d.getTime() - monday * DAY_MS;
}

function fmtWeek(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function ScheduleStrip({ posts, today }: { posts: AdminBlogPost[]; today: string }) {
  const weeks = useMemo(() => {
    const counts = new Map<number, number>();
    for (const post of posts) {
      if (post.status !== "scheduled") continue;
      const week = startOfWeekUTC(post.date);
      counts.set(week, (counts.get(week) || 0) + 1);
    }
    const first = startOfWeekUTC(today);
    return Array.from({ length: WEEKS_SHOWN }, (_, i) => {
      const ts = first + i * 7 * DAY_MS;
      return { ts, label: fmtWeek(ts), count: counts.get(ts) || 0 };
    });
  }, [posts, today]);

  const totalScheduled = posts.filter((p) => p.status === "scheduled").length;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Next {WEEKS_SHOWN} weeks</h2>
        <span className="text-xs text-slate-500">
          {totalScheduled} post{totalScheduled === 1 ? "" : "s"} queued
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {weeks.map((week) => (
          <div
            key={week.ts}
            className={`rounded-lg border px-3 py-2 text-center ${
              week.count > 0
                ? "border-slate-200 bg-slate-50"
                : "border-amber-200 bg-amber-50"
            }`}
            title={
              week.count > 0
                ? `${week.count} post(s) scheduled the week of ${week.label}`
                : `No posts scheduled the week of ${week.label}`
            }
          >
            <div className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {week.label}
            </div>
            <div
              className={`mt-0.5 text-sm font-semibold ${
                week.count > 0 ? "text-slate-900" : "text-amber-700"
              }`}
            >
              {week.count > 0 ? week.count : "gap"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
