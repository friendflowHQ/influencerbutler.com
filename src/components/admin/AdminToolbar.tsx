"use client";

// Sticky page header for admin pages: title, an optional range control, and a
// "Updated 2 min ago" stamp with a Refresh button. Stays visible while the page
// scrolls so freshness and the range are always in view. Pass `updatedAt`
// (ms epoch) after each successful load.

import { useEffect, useState } from "react";

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.round(m / 60)} h ago`;
}

export default function AdminToolbar({
  title,
  subtitle,
  updatedAt,
  refreshing = false,
  onRefresh,
  children,
  below,
}: {
  title: string;
  subtitle?: string;
  updatedAt: number | null;
  refreshing?: boolean;
  onRefresh?: () => void;
  /** Range control or other page-level actions, shown on the right. */
  children?: React.ReactNode;
  /** Optional row under the title that stays sticky with it, e.g. an "On this page" nav. */
  below?: React.ReactNode;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(t);
  }, []);

  return (
    <div className="sticky top-0 z-20 -mx-6 border-b border-slate-200 bg-slate-50/95 px-6 py-3 backdrop-blur">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {children}
          {onRefresh ? (
            <div className="flex items-center gap-2 text-xs text-slate-600">
              <span aria-live="polite">
                {refreshing ? "Refreshing..." : updatedAt ? `Updated ${ago(now - updatedAt)}` : ""}
              </span>
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Refresh
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {below ? <div className="mt-2">{below}</div> : null}
    </div>
  );
}
