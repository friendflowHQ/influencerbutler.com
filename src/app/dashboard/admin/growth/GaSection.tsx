"use client";

// Google Analytics panel: 28-day trend, channels, top pages - or the
// "Connect GA" setup card until the service-account env vars exist.

import GaTrendChart, { type GaTrendDay } from "./GaTrendChart";

export type GaResponse = {
  configured: boolean;
  error?: boolean;
  cachedAt?: string | null;
  realtimeActiveUsers?: number | null;
  trend?: {
    days: GaTrendDay[];
    totals: { activeUsers: number; newUsers: number };
    prevTotals: { activeUsers: number; newUsers: number };
  } | null;
  channels?: { channel: string; sessions: number }[] | null;
  topPages?: { path: string; views: number }[] | null;
};

const SETUP_STEPS = [
  "In Google Cloud Console, create (or reuse) a project, add a Service Account, and download its JSON key.",
  'Enable the "Google Analytics Data API" for that project.',
  "In GA Admin > Property Access Management, add the service account's email as a Viewer.",
  "In Vercel, set GA4_PROPERTY_ID (the numeric property id from GA Admin > Property Settings) and GA_SERVICE_ACCOUNT_JSON (the whole key file), then redeploy.",
];

function deltaLabel(current: number, previous: number): { text: string; tone: string } | null {
  if (previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  if (Math.abs(pct) < 0.5) return { text: "flat vs prior 28 days", tone: "text-slate-400" };
  return pct > 0
    ? { text: `↑ ${pct.toFixed(0)}% vs prior 28 days`, tone: "text-emerald-600" }
    : { text: `↓ ${Math.abs(pct).toFixed(0)}% vs prior 28 days`, tone: "text-rose-600" };
}

export default function GaSection({
  data,
  loading,
  onRefresh,
  refreshing,
}: {
  data: GaResponse | null;
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
          Google Analytics, last 28 days
        </h2>
        {data?.configured ? (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-3 h-48 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      ) : !data || !data.configured ? (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-5">
          <p className="text-sm font-semibold text-indigo-900">Connect Google Analytics</p>
          <p className="mt-1 text-sm text-indigo-800">
            One 10-minute setup pulls live visitors, traffic sources, and top pages straight into
            this dashboard. Everything else here already works.
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-indigo-900">
            {SETUP_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : (
        <>
          {data.error ? (
            <p className="mt-2 text-xs text-amber-700">
              Google Analytics did not respond just now
              {data.trend ? " - showing the last cached numbers." : "."}
            </p>
          ) : null}

          {data.trend ? (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold text-slate-900">
                    {data.trend.totals.activeUsers.toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">Active users</p>
                  {(() => {
                    const d = deltaLabel(
                      data.trend!.totals.activeUsers,
                      data.trend!.prevTotals.activeUsers,
                    );
                    return d ? <p className={`mt-1 text-xs font-semibold ${d.tone}`}>{d.text}</p> : null;
                  })()}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-2xl font-bold text-slate-900">
                    {data.trend.totals.newUsers.toLocaleString("en-US")}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500">New users</p>
                  {(() => {
                    const d = deltaLabel(
                      data.trend!.totals.newUsers,
                      data.trend!.prevTotals.newUsers,
                    );
                    return d ? <p className={`mt-1 text-xs font-semibold ${d.tone}`}>{d.text}</p> : null;
                  })()}
                </div>
              </div>

              <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
                <GaTrendChart days={data.trend.days} />
              </div>
            </>
          ) : null}

          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {data.channels && data.channels.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Where visitors come from
                </p>
                <div className="mt-3 space-y-2">
                  {(() => {
                    const maxSessions = Math.max(1, ...data.channels!.map((c) => c.sessions));
                    return data.channels!.map((c) => (
                      <div key={c.channel} className="flex items-center gap-2 text-sm">
                        <span className="w-36 truncate text-slate-600" title={c.channel}>
                          {c.channel}
                        </span>
                        <span
                          className="h-2.5 rounded bg-violet-300"
                          style={{ width: `${Math.max(4, Math.round((c.sessions / maxSessions) * 160))}px` }}
                        />
                        <span className="text-xs font-medium text-slate-500">
                          {c.sessions.toLocaleString("en-US")}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            ) : null}

            {data.topPages && data.topPages.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Top pages
                </p>
                <ul className="mt-3 space-y-2">
                  {data.topPages.map((p) => (
                    <li key={p.path} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-slate-600" title={p.path}>
                        {p.path}
                      </span>
                      <span className="shrink-0 text-xs font-medium text-slate-500">
                        {p.views.toLocaleString("en-US")} views
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {data.cachedAt ? (
            <p className="mt-2 text-xs text-slate-400">
              Updated {new Date(data.cachedAt).toLocaleString("en-US")} (cached up to an hour).
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
