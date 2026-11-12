"use client";

import { useEffect, useState } from "react";

/**
 * Dashboard price lock banner (until Nov 30 2026, 11:59pm Pacific). The
 * version depends on who is looking (/api/me/price-lock-status): paying users
 * are reassured, comped users get the Keep my plan link, everyone else gets
 * the countdown and a trial button. Disappears on its own at the deadline.
 */
type Status = { state: "locked" | "comp" | "open" | "none"; endsAt: string; keepUrl?: string };

function left(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}

export default function PriceLockBanner() {
  const [status, setStatus] = useState<Status | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    let alive = true;
    fetch("/api/me/price-lock-status", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: Status | null) => {
        if (alive && data) setStatus(data);
      })
      .catch(() => {});
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!status || status.state === "none") return null;
  const end = Date.parse(status.endsAt);
  if (!Number.isFinite(end) || now >= end) return null;

  if (status.state === "locked") {
    return (
      <div
        role="region"
        aria-label="Price lock"
        className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-900"
      >
        You&apos;re locked in at your current price as long as you stay.
      </div>
    );
  }

  const comp = status.state === "comp" && status.keepUrl;
  return (
    <div
      role="region"
      aria-label="Price change notice"
      className="mb-6 rounded-2xl border border-orange-300 bg-orange-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {comp
              ? "Add a card by Nov 30 to keep today's price. No charge until your free time ends."
              : "Prices go up Nov 30. Lock today's price forever."}
          </p>
          <p className="mt-1 text-sm tabular-nums text-slate-700">{left(end - now)} left</p>
        </div>
        <a
          href={comp ? status.keepUrl : "/pricing?src=pl-dashboard"}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-700 focus-visible:ring-offset-2"
        >
          {comp ? "Keep today's price" : "Start free trial"}
        </a>
      </div>
    </div>
  );
}
