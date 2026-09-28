"use client";

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

export type SearchResponse = {
  configured: boolean;
  error?: boolean;
  errorDetail?: string | null;
  cachedAt?: string | null;
  topQueries?: GscRow[] | null;
  topPages?: GscRow[] | null;
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

// Search Console returns full URLs for the page dimension; show just the path.
function prettyPath(url: string): string {
  try {
    return new URL(url).pathname || url;
  } catch {
    return url;
  }
}
