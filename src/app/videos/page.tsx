import Link from "next/link";
import type { Metadata } from "next";
import {
  SITE_ORIGIN,
  formatDuration,
  groupVideos,
  loadVideoCatalog,
  totalMinutes,
  videoPageUrl,
} from "@/lib/video-catalog";

export const revalidate = 3600;

const PAGE_URL = `${SITE_ORIGIN}/videos`;

export const metadata: Metadata = {
  title: "Walkthrough Videos: Every Influencer Butler Tool in Two Minutes",
  description:
    "Short screen recordings of Influencer Butler, narrated start to finish: getting started, Deals Butler, Creator Connections, Walmart, Benable, Levanta and more. Every video has a transcript.",
  alternates: { canonical: PAGE_URL },
  openGraph: {
    title: "Influencer Butler walkthrough videos",
    description: "Every tool, shown running inside the app, in about two minutes each.",
    url: PAGE_URL,
    type: "website",
  },
};

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default async function VideosHubPage() {
  const catalog = await loadVideoCatalog();
  const groups = groupVideos(catalog);
  const minutes = totalMinutes(catalog.videos);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": PAGE_URL,
        url: PAGE_URL,
        name: "Influencer Butler walkthrough videos",
        description: metadata.description,
        isPartOf: { "@type": "WebSite", url: SITE_ORIGIN, name: "Influencer Butler" },
      },
      {
        "@type": "ItemList",
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        numberOfItems: catalog.videos.length,
        itemListElement: catalog.videos.map((v, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: videoPageUrl(v),
          name: v.title,
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_ORIGIN}/` },
          { "@type": "ListItem", position: 2, name: "Videos", item: PAGE_URL },
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#f97316]/20 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-4 py-14 text-center sm:px-6 lg:py-20">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f97316]/30 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c2410c]">
            Walkthrough videos
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            Every tool, shown running, in about two minutes.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
            Real screen recordings of Influencer Butler, narrated start to finish. No slides, no
            mock-ups. Each video has a written transcript, and the matching step-by-step guide is
            one click away.
          </p>
          <p className="mt-4 text-sm text-slate-500">
            {catalog.videos.length} videos, about {minutes} minutes in total. New walkthroughs land
            here as tools ship.
          </p>
          {groups.length > 1 ? (
            <nav aria-label="Video groups" className="mt-8 flex flex-wrap justify-center gap-2">
              {groups.map((g) => (
                <a
                  key={g.group}
                  href={`#${slugify(g.group)}`}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-700 hover:border-[#f97316] hover:text-[#c2410c]"
                >
                  {g.group} <span className="text-slate-600">({g.videos.length})</span>
                </a>
              ))}
            </nav>
          ) : null}
        </div>
      </section>

      {groups.length === 0 ? (
        <section className="mx-auto max-w-3xl px-4 py-16 text-center text-slate-600">
          <p>The video catalog is being regenerated. Check back shortly, or browse the{" "}
            <Link href="/features/deals-butler" className="font-medium text-[#c2410c] underline">
              feature pages
            </Link>
            .
          </p>
        </section>
      ) : (
        groups.map((g) => (
          <section
            key={g.group}
            id={slugify(g.group)}
            aria-labelledby={`${slugify(g.group)}-title`}
            className="mx-auto max-w-6xl scroll-mt-24 px-4 py-10 sm:px-6"
          >
            <h2 id={`${slugify(g.group)}-title`} className="text-2xl font-bold tracking-tight text-slate-900">
              {g.group}
            </h2>
            <ul className="mt-6 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-3">
              {g.videos.map((v) => (
                <li key={v.slug}>
                  <article className="group flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-[#f97316] hover:shadow-md">
                    <Link href={`/videos/${v.slug}`} className="relative block aspect-video bg-slate-100">
                      {/* Thumbnail is decorative: the title link carries the name. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={v.thumbnailUrl}
                        alt=""
                        width={480}
                        height={360}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      <span className="absolute bottom-2 right-2 rounded bg-slate-900/85 px-1.5 py-0.5 text-xs font-semibold text-white">
                        {formatDuration(v.seconds)}
                      </span>
                    </Link>
                    <div className="flex flex-1 flex-col p-5">
                      <h3 className="text-base font-semibold leading-snug text-slate-900">
                        <Link href={`/videos/${v.slug}`} className="group-hover:text-[#c2410c]">
                          {v.title}
                        </Link>
                      </h3>
                      {v.description ? (
                        <p className="mt-2 flex-1 text-sm text-slate-600">{v.description}</p>
                      ) : (
                        <span className="flex-1" />
                      )}
                      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                        <Link href={`/videos/${v.slug}`} className="font-semibold text-[#c2410c]">
                          Watch
                        </Link>
                        {v.featureSlug ? (
                          <a href={`/features/${v.featureSlug}`} className="text-slate-600 underline-offset-2 hover:underline">
                            Feature page
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <section className="mx-auto max-w-4xl px-4 pb-20 pt-6 text-center sm:px-6">
        <div className="rounded-2xl border border-orange-100 bg-orange-50 px-6 py-10">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Ready to see it on your own storefront?</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            Free download for Windows and Mac. Every Pro plan starts with a 14-day free trial.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <a
              href="/download"
              className="rounded-lg bg-[#f97316] px-5 py-3 text-sm font-semibold text-white shadow hover:bg-[#ea580c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c2410c]"
            >
              Download the app
            </a>
            <a
              href="https://www.youtube.com/@InfluencerButler"
              rel="noopener"
              className="rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:border-slate-400"
            >
              Subscribe on YouTube
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
