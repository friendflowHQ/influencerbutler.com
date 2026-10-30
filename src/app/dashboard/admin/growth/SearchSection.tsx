"use client";

import { followUpFocus, recheckDate } from "@/lib/striking-distance";

// Google Search Console panel: the actual terms people search to find the site
// (clicks, impressions, CTR, position) - or the "Connect Search Console" setup
// card until the property + service account are wired up. GA4 cannot show these
// terms; Search Console is the only source.

export type GscRow = {
  key: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type StrikingRow = {
  query: string;
  page: string;
  pageKind: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  potentialClicks: number;
  action: string;
  prevPosition?: number | null;
  isNew?: boolean;
  /** YYYY-MM-DD of a recent page edit Search Console has not caught up with yet. */
  recentlyUpdated?: string | null;
  /** Other queries on the same page, folded into this row. */
  relatedQueries?: { query: string; position: number; impressions: number; clicks: number }[];
};

export type SearchResponse = {
  configured: boolean;
  error?: boolean;
  errorDetail?: string | null;
  cachedAt?: string | null;
  topQueries?: GscRow[] | null;
  topPages?: GscRow[] | null;
  strikingDistance?: StrikingRow[] | null;
  strikingSnapshotAt?: string | null;
};

const SETUP_STEPS = [
  "Add your site in Google Search Console (search.google.com/search-console) and verify it (the homepage already carries a verification meta tag, or use a DNS TXT record).",
  "Submit sitemap.xml in Search Console, then use Request Indexing on your key pages.",
  "In Search Console Settings > Users and permissions, add the SAME service-account email you used for Google Analytics (Restricted access is enough).",
  'In Google Cloud Console, enable the "Google Search Console API" for that project.',
  "In Vercel, set GSC_SITE_URL to your verified property (for example sc-domain:influencerbutler.com), then redeploy.",
];

function pct(ctr: number): string {
  return `${(ctr * 100).toFixed(1)}%`;
}

export default function SearchSection({
  data,
  loading,
  onRefresh,
  refreshing,
}: {
  data: SearchResponse | null;
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <section className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
          Search terms, last 28 days
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
          <p className="text-sm font-semibold text-indigo-900">Connect Google Search Console</p>
          <p className="mt-1 text-sm text-indigo-800">
            This shows the exact phrases people search to find you, which Google Analytics hides.
            It reuses the same Google service account you already set up for Analytics.
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
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {data.errorDetail ?? "Search Console did not respond just now."}
              {data.topQueries && data.topQueries.length > 0
                ? " Showing the last cached numbers."
                : ""}
            </p>
          ) : null}

          {(!data.topQueries || data.topQueries.length === 0) &&
          (!data.topPages || data.topPages.length === 0) ? (
            // Only the "waiting for data" reassurance when Google actually
            // responded with an empty set; a real error shows the amber box above.
            data.error ? null : (
              <p className="mt-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                Connected, but Search Console has no query data yet. New sites take a few days to
                a couple of weeks to collect impressions. Check back soon.
              </p>
            )
          ) : (
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {data.topQueries && data.topQueries.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Top search queries
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-medium text-slate-400">
                          <th className="pb-1 pr-2 font-medium">Query</th>
                          <th className="pb-1 px-2 text-right font-medium">Clicks</th>
                          <th className="pb-1 px-2 text-right font-medium">Impr.</th>
                          <th className="pb-1 pl-2 text-right font-medium">Pos.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topQueries.map((q) => (
                          <tr key={q.key} className="border-t border-slate-100">
                            <td className="py-1.5 pr-2 text-slate-700" title={q.key}>
                              {q.key}
                            </td>
                            <td className="py-1.5 px-2 text-right font-medium text-slate-800">
                              {q.clicks.toLocaleString("en-US")}
                            </td>
                            <td className="py-1.5 px-2 text-right text-slate-500">
                              {q.impressions.toLocaleString("en-US")}
                            </td>
                            <td className="py-1.5 pl-2 text-right text-slate-500">
                              {q.position.toFixed(1)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              {data.topPages && data.topPages.length > 0 ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Top pages from search
                  </p>
                  <ul className="mt-3 space-y-2">
                    {data.topPages.map((p) => (
                      <li key={p.key} className="flex items-center justify-between gap-3 text-sm">
                        <span className="truncate text-slate-600" title={p.key}>
                          {prettyPath(p.key)}
                        </span>
                        <span className="shrink-0 text-xs font-medium text-slate-500">
                          {p.clicks.toLocaleString("en-US")} clicks · {pct(p.ctr)} CTR
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          <StrikingDistancePanel
            rows={data.strikingDistance ?? null}
            snapshotAt={data.strikingSnapshotAt ?? null}
          />

          {data.cachedAt ? (
            <p className="mt-2 text-xs text-slate-400">
              Updated {new Date(data.cachedAt).toLocaleString("en-US")} (cached up to an hour).
              Search Console data lags 2 to 3 days.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

// Queries already ranking on the edge of page 1 or on page 2, ranked by how many
// extra clicks reaching position 3 would add. The weekly snapshot (Mondays) lets
// each row show how its position moved since last week.
function StrikingDistancePanel({
  rows,
  snapshotAt,
}: {
  rows: StrikingRow[] | null;
  snapshotAt: string | null;
}) {
  return (
    <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Striking distance: this week&apos;s easiest wins
        </p>
        <p className="text-xs text-slate-500">
          Queries at position 4 to 20, ranked by clicks gained if they reached position 3.
        </p>
      </div>

      {rows === null ? (
        <p className="mt-3 text-sm text-slate-600">
          Not loaded yet. Press Refresh to pull this list from Search Console.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No non-brand queries are sitting between position 4 and 20 with enough impressions yet.
          That is normal for a young site; check back as impressions build.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs font-medium text-slate-500">
                <th className="pb-1 pr-2 font-medium">Query and page</th>
                <th className="pb-1 px-2 text-right font-medium">Pos.</th>
                <th className="pb-1 px-2 text-right font-medium">Impr.</th>
                <th className="pb-1 px-2 text-right font-medium">Clicks</th>
                <th className="pb-1 px-2 text-right font-medium">Upside</th>
                <th className="pb-1 pl-2 font-medium">Next step</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.query}
                  className={`border-t border-slate-100 align-top ${r.recentlyUpdated ? "bg-slate-50" : ""}`}
                >
                  <td className="py-2 pr-2">
                    <p className="font-medium text-slate-800">{r.query}</p>
                    <p className="text-xs text-slate-500" title={r.page}>
                      {r.page}
                    </p>
                    {r.relatedQueries && r.relatedQueries.length > 0 ? (
                      <details className="mt-1 text-xs text-slate-600">
                        <summary className="cursor-pointer text-indigo-700">
                          +{r.relatedQueries.length} related{" "}
                          {r.relatedQueries.length === 1 ? "query" : "queries"} on this page
                        </summary>
                        <ul className="mt-1 space-y-0.5">
                          {r.relatedQueries.map((q) => (
                            <li key={q.query}>
                              {q.query}{" "}
                              <span className="text-slate-500">
                                (pos {q.position.toFixed(1)}, {q.impressions.toLocaleString("en-US")}{" "}
                                impr, {q.clicks.toLocaleString("en-US")} clicks)
                              </span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-700">
                    <span className="block">{r.position.toFixed(1)}</span>
                    <Movement row={r} hasSnapshot={snapshotAt !== null} />
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600">
                    {r.impressions.toLocaleString("en-US")}
                  </td>
                  <td className="py-2 px-2 text-right text-slate-600">
                    {r.clicks.toLocaleString("en-US")}
                  </td>
                  <td className="py-2 px-2 text-right font-medium text-emerald-700">
                    +{Math.max(1, Math.round(r.potentialClicks)).toLocaleString("en-US")}
                  </td>
                  <td className="py-2 pl-2 text-xs text-slate-600">
                    {r.recentlyUpdated ? (
                      <span title={`Suggested before the edit: ${r.action}`}>
                        <span className="inline-block rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-800">
                          Updated {formatDay(r.recentlyUpdated)}, waiting on Google
                        </span>{" "}
                        <span className="block mt-1">
                          Hold off changing this page until{" "}
                          {formatDay(recheckDate(r.recentlyUpdated) ?? r.recentlyUpdated)}, when Search
                          Console has fully caught up.{" "}
                          {followUpFocus(r) === "ctr"
                            ? "Then check CTR: the page is seen but not clicked, so the title and meta description are the next lever."
                            : "Then check rank: it needs depth and internal links, not title changes."}
                        </span>
                      </span>
                    ) : (
                      r.action
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-500">
        {snapshotAt
          ? `Movement compares to the weekly snapshot from ${new Date(snapshotAt).toLocaleDateString("en-US")}. A lower position number is better.`
          : "Week-over-week movement appears after the first Monday snapshot runs."}
      </p>
    </div>
  );
}

// YYYY-MM-DD as a short date, read in UTC so it never shifts a day.
function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// Position moved vs the weekly snapshot. Lower is better, so a drop in the
// number is an improvement. Colors keep AA contrast on white; the word carries
// the meaning too.
function Movement({ row, hasSnapshot }: { row: StrikingRow; hasSnapshot: boolean }) {
  if (!hasSnapshot) return null;
  if (row.isNew) {
    return <span className="text-xs font-medium text-indigo-700">New</span>;
  }
  if (row.prevPosition === null || row.prevPosition === undefined) return null;
  const delta = row.prevPosition - row.position;
  if (Math.abs(delta) < 0.2) return <span className="text-xs text-slate-500">Steady</span>;
  return delta > 0 ? (
    <span className="text-xs font-medium text-emerald-700">Up {delta.toFixed(1)}</span>
  ) : (
    <span className="text-xs font-medium text-rose-700">Down {Math.abs(delta).toFixed(1)}</span>
  );
}

// Search Console returns full URLs for the page dimension; show just the path.
function prettyPath(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}
