import Link from "next/link";
import type { Metadata } from "next";
import { loadPublishedPosts, formatBlogDate } from "@/lib/blog";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";

export const revalidate = 300;

const SITE = "https://www.influencerbutler.com";

export const metadata: Metadata = {
  title: "The Influencer Butler Blog: Amazon, Benable & Instagram Creator Tactics",
  description:
    "Practical, no-fluff guides for Amazon Creator Connections, daily deals, Benable, and Instagram influencers. Earn more, post smarter, and win back your time.",
  keywords:
    "amazon influencer blog, creator connections, amazon storefront tips, benable, instagram influencer, affiliate deals, influencer automation",
  alternates: { canonical: `${SITE}/blog` },
  openGraph: {
    title: "The Influencer Butler Blog",
    description:
      "Practical guides for Amazon, Benable, daily deals, and Instagram influencers who want to earn more and work less.",
    url: `${SITE}/blog`,
    type: "website",
    siteName: "Influencer Butler",
  },
  twitter: {
    card: "summary_large_image",
    title: "The Influencer Butler Blog",
    description:
      "Practical guides for Amazon, Benable, daily deals, and Instagram influencers.",
  },
};

export default async function BlogIndexPage() {
  const posts = await loadPublishedPosts();
  const [featured, ...rest] = posts;

  return (
    <main className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
          The Influencer Butler Blog
        </p>
        <h1 className="mt-3 max-w-3xl text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Earn more from your influence, with a lot less busywork.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-slate-600">
          Real tactics for Amazon Creator Connections, daily deals, Benable, and
          Instagram creators. No fluff, no recycled advice, just the things that
          actually move your commissions.
        </p>

        {featured ? (
          <Link
            href={`/blog/${featured.id}`}
            className="group mt-10 grid overflow-hidden rounded-2xl border border-slate-200 transition hover:border-orange-300 hover:shadow-lg lg:grid-cols-2"
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 lg:aspect-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={featured.image}
                alt={featured.imageAlt}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                loading="eager"
              />
            </div>
            <div className="flex flex-col justify-center p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
                {featured.category}
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 group-hover:text-orange-700">
                {featured.title}
              </h2>
              <p className="mt-3 text-slate-600">{featured.summary}</p>
              <p className="mt-5 text-sm text-slate-500">
                {formatBlogDate(featured.date)} &middot; {featured.readingTime}
              </p>
            </div>
          </Link>
        ) : null}

        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.id}`}
              className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 transition hover:border-orange-300 hover:shadow-md"
            >
              <div className="aspect-[16/10] overflow-hidden bg-slate-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={post.image}
                  alt={post.imageAlt}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="flex flex-1 flex-col p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-orange-600">
                  {post.category}
                </p>
                <h3 className="mt-2 text-lg font-semibold leading-snug text-slate-900 group-hover:text-orange-700">
                  {post.title}
                </h3>
                <p className="mt-2 line-clamp-3 text-sm text-slate-600">
                  {post.summary}
                </p>
                <p className="mt-4 text-xs text-slate-500">
                  {formatBlogDate(post.date)} &middot; {post.readingTime}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-orange-200 bg-orange-50 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Spend your time creating, not copy-pasting.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Influencer Butler automates the busywork behind Amazon Creator
            Connections, daily deals, Benable, and Instagram outreach, so you can
            focus on the part only you can do.
          </p>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-md bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Start your 3-day free trial
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
