import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import SiteSearch from "@/components/SiteSearch";
import {
  searchSite,
  SITE_SEARCH_TYPE_LABELS,
  type SiteSearchResult,
  type SiteSearchType,
} from "@/lib/site-search";

// A search results page has no stable content of its own, so keep it out of
// the index (but let engines follow the links it surfaces).
export const metadata: Metadata = {
  title: "Search - Influencer Butler",
  description: "Search Influencer Butler blog posts, help tutorials, features, and pages.",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

const SECTION_ORDER: SiteSearchType[] = ["feature", "page", "help", "blog"];

function groupByType(results: SiteSearchResult[]): Map<SiteSearchType, SiteSearchResult[]> {
  const map = new Map<SiteSearchType, SiteSearchResult[]>();
  for (const type of SECTION_ORDER) map.set(type, []);
  for (const r of results) {
    if (!map.has(r.type)) map.set(r.type, []);
    map.get(r.type)!.push(r);
  }
  return map;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; lang?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawQ = Array.isArray(params.q) ? params.q[0] : params.q;
  const rawLang = Array.isArray(params.lang) ? params.lang[0] : params.lang;
  const query = (rawQ || "").trim();

  const results = query.length >= 2 ? await searchSite(query, { locale: rawLang, limit: 60 }) : [];
  const grouped = groupByType(results);

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      <section className="mx-auto max-w-4xl px-6 py-12">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Search
        </h1>
        <p className="mt-2 text-slate-600">
          Blog posts, help tutorials, features, and pages, all in one place.
        </p>

        <div className="mt-6">
          <SiteSearch variant="page" initialQuery={query} autoFocus={query.length === 0} />
        </div>

        {query.length < 2 ? (
          <p className="mt-12 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
            Type at least two characters to search.
          </p>
        ) : results.length === 0 ? (
          <div className="mt-12 rounded-xl border border-dashed border-slate-300 p-8 text-center">
            <p className="text-slate-700">
              No results for &ldquo;{query}&rdquo;.
            </p>
            <p className="mt-2 text-sm text-slate-500">
              Try a different keyword, or browse the{" "}
              <Link href="/blog" className="text-orange-600 underline">
                blog
              </Link>{" "}
              and{" "}
              <Link href="/help" className="text-orange-600 underline">
                help center
              </Link>
              .
            </p>
          </div>
        ) : (
          <>
            <p className="mt-6 text-sm text-slate-500">
              {results.length} {results.length === 1 ? "result" : "results"} for &ldquo;{query}&rdquo;
            </p>
            <div className="mt-8 space-y-12">
              {SECTION_ORDER.map((type) => {
                const items = grouped.get(type) || [];
                if (items.length === 0) return null;
                return (
                  <section key={type}>
                    <h2 className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                      {SITE_SEARCH_TYPE_LABELS[type]}
                    </h2>
                    <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
                      {items.map((r) => (
                        <li key={r.id}>
                          <Link
                            href={r.url}
                            className="flex items-start gap-4 px-5 py-4 transition hover:bg-slate-50"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-slate-900">
                                {r.title}
                              </span>
                              {r.summary ? (
                                <span className="mt-1 line-clamp-2 block text-sm text-slate-600">
                                  {r.summary}
                                </span>
                              ) : null}
                              <span className="mt-1 block text-xs text-slate-400">
                                {r.category}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </section>

      <SiteFooter />
    </main>
  );
}
