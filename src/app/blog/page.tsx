import Link from "next/link";
import type { Metadata } from "next";
import { loadPublishedPosts, formatBlogDate, postTopics, todayISO } from "@/lib/blog";
import type { BlogManifestEntry } from "@/lib/blog";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import SiteSearch from "@/components/SiteSearch";
import NewsletterSignup from "@/components/NewsletterSignup";

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

// Per-topic accent so a grid of similar illustrations is still scannable: a
// colored top bar on the card and a matching label. Text uses the -700 shade
// to stay above the 4.5:1 contrast bar; the bar is decorative.
const TOPIC_STYLE: Record<string, { bar: string; text: string }> = {
  Amazon: { bar: "border-t-amber-500", text: "text-amber-800" },
  Benable: { bar: "border-t-pink-500", text: "text-pink-700" },
  Content: { bar: "border-t-violet-500", text: "text-violet-700" },
  Deals: { bar: "border-t-red-500", text: "text-red-700" },
  Facebook: { bar: "border-t-blue-500", text: "text-blue-700" },
  Growth: { bar: "border-t-emerald-500", text: "text-emerald-700" },
  Instagram: { bar: "border-t-fuchsia-500", text: "text-fuchsia-700" },
  Pinterest: { bar: "border-t-rose-500", text: "text-rose-700" },
  Proxy: { bar: "border-t-slate-500", text: "text-slate-700" },
  TikTok: { bar: "border-t-cyan-500", text: "text-cyan-800" },
  Walmart: { bar: "border-t-sky-500", text: "text-sky-700" },
};
const DEFAULT_TOPIC_STYLE = { bar: "border-t-orange-500", text: "text-orange-700" };

function topicStyle(category: string) {
  return TOPIC_STYLE[category] ?? DEFAULT_TOPIC_STYLE;
}

// Badge for the corner of a post image: seasonal first, then "New" for posts
// from the last 14 days. Black Friday posts stop being flagged after Nov 30.
function postBadge(post: BlogManifestEntry): string | null {
  const today = todayISO();
  const text = `${post.title} ${post.tags || ""} ${post.keywords || ""}`.toLowerCase();
  if (text.includes("black friday") && today <= `${today.slice(0, 4)}-11-30` && today >= `${today.slice(0, 4)}-10-15`) {
    return "Trending: Black Friday";
  }
  const ageDays = (Date.parse(today) - Date.parse(post.date)) / 86_400_000;
  return ageDays >= 0 && ageDays <= 14 ? "New" : null;
}

function Badge({ label }: { label: string }) {
  return (
    <span className="absolute left-3 top-3 rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
      {label}
    </span>
  );
}

function PostCard({ post }: { post: BlogManifestEntry }) {
  const style = topicStyle(post.category);
  const badge = postBadge(post);
  return (
    <Link
      href={`/blog/${post.id}`}
      className={`group flex flex-col overflow-hidden rounded-xl border border-t-4 border-slate-200 ${style.bar} transition hover:border-orange-300 hover:shadow-md`}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.image}
          alt={post.imageAlt}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          loading="lazy"
        />
        {badge ? <Badge label={badge} /> : null}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <p className={`text-xs font-semibold uppercase tracking-widest ${style.text}`}>{post.category}</p>
        <h3 className="mt-2 text-lg font-semibold leading-snug text-slate-900 group-hover:text-orange-700">
          {post.title}
        </h3>
        <p className="mt-2 line-clamp-3 text-sm text-slate-600">{post.summary}</p>
        <p className="mt-4 text-xs text-slate-600">
          By {post.author} &middot; {formatBlogDate(post.date)} &middot; {post.readingTime}
        </p>
        <span className="mt-2 text-sm font-semibold text-orange-700 group-hover:underline">
          Read article &rarr;
        </span>
      </div>
    </Link>
  );
}

function MidFeedNewsletter() {
  return (
    <div className="my-10 grid items-center gap-6 rounded-2xl border border-orange-200 bg-orange-50 p-6 md:grid-cols-2">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Get the next tactic in your inbox</h2>
        <p className="mt-2 text-slate-600">
          One short email a week with what is working for Amazon, Benable and Instagram creators right now.
        </p>
      </div>
      <NewsletterSignup source="blog-index-midfeed" />
    </div>
  );
}

function MidFeedCourse() {
  return (
    <div className="my-10 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center md:flex md:items-center md:justify-between md:gap-6 md:text-left">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-slate-900">Free course: Amazon Influencer, step by step</h2>
        <p className="mt-2 text-slate-600">
          Short lessons on Creator Connections, your storefront and commissions. No cost, no card.
        </p>
      </div>
      <a
        href="/course/amazon-influencer"
        className="mt-4 inline-block shrink-0 rounded-md bg-orange-700 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-800 md:mt-0"
      >
        Start the free course
      </a>
    </div>
  );
}

const GRID = "grid gap-8 sm:grid-cols-2 lg:grid-cols-3";
const ROW_SIZE = 6;

type BlogView = "new" | "quick" | "deep";

const VIEWS: { id: BlogView; label: string; hint: string }[] = [
  { id: "new", label: "Newest", hint: "All posts, newest first" },
  { id: "quick", label: "Quick reads", hint: "6 minutes or less" },
  { id: "deep", label: "In-depth", hint: "9 minutes or more" },
];

// Hand-picked entry points for first-time readers. Ids must exist in
// content/blog/_index.json; any that go missing (or get retired) are skipped.
const START_HERE: { id: string; label: string }[] = [
  { id: "amazon-creator-connections-guide-2026", label: "New to Amazon Creator Connections?" },
  { id: "make-money-on-benable-beginners", label: "Want to earn on Benable?" },
  { id: "grow-instagram-from-zero", label: "Growing Instagram from zero?" },
];

function minutesOf(readingTime: string): number {
  const n = parseInt(readingTime, 10);
  return Number.isFinite(n) ? n : 7;
}

function blogHref(tag: string, view: BlogView): string {
  const q = new URLSearchParams();
  if (tag) q.set("tag", tag);
  if (view !== "new") q.set("view", view);
  const qs = q.toString();
  return qs ? `/blog?${qs}` : "/blog";
}

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ tag?: string | string[]; view?: string | string[] }>;
}) {
  const params = await searchParams;
  const rawTag = Array.isArray(params.tag) ? params.tag[0] : params.tag;
  const tag = (rawTag || "").trim();
  const rawView = Array.isArray(params.view) ? params.view[0] : params.view;
  const view: BlogView = rawView === "quick" || rawView === "deep" ? rawView : "new";

  const posts = await loadPublishedPosts();

  // Topic chips (category + extra tags) with post counts, most-covered first so
  // the big topics lead and the long tail trails. Ties fall back to A-Z.
  const topicCounts = new Map<string, number>();
  for (const p of posts) {
    for (const t of new Set(postTopics(p))) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);
  }
  const allTopics = Array.from(topicCounts.keys()).sort(
    (a, b) => (topicCounts.get(b) || 0) - (topicCounts.get(a) || 0) || a.localeCompare(b),
  );

  const byTag = tag
    ? posts.filter((p) => postTopics(p).some((t) => t.toLowerCase() === tag.toLowerCase()))
    : posts;
  const filtered =
    view === "quick"
      ? byTag.filter((p) => minutesOf(p.readingTime) <= 6)
      : view === "deep"
        ? byTag.filter((p) => minutesOf(p.readingTime) >= 9)
        : byTag;
  const filtering = Boolean(tag) || view !== "new";

  // The big featured hero card and the Start here row only make sense for the
  // unfiltered, full feed. Any filter shows every match in one plain grid.
  const [featured, rest] = filtering ? [undefined, filtered] : [filtered[0], filtered.slice(1)];
  const startHere = filtering
    ? []
    : START_HERE.map((s) => ({ ...s, post: posts.find((p) => p.id === s.id) })).filter(
        (s) => s.post && s.post.id !== featured?.id,
      );

  return (
    <main id="main-content" className="min-h-screen bg-white text-slate-900">
      <SiteHeader />

      <section className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid items-center gap-8 lg:grid-cols-[1fr_380px]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-700">
              The Influencer Butler Blog
            </p>
            <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
              Earn more from your influence, with a lot less busywork.
            </h1>
            <p className="mt-3 max-w-2xl text-base text-slate-600 sm:text-lg">
              Real tactics for Amazon, Benable, daily deals and Instagram creators.
            </p>
            <div className="mt-4 max-w-md">
              <SiteSearch variant="inline" />
            </div>
          </div>
          <NewsletterSignup
            source="blog-index-hero"
            title="Weekly creator tactics"
            subtitle="One short email a week. No fluff, unsubscribe anytime."
            className="rounded-2xl border border-orange-200 bg-orange-50 p-5"
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">
            Browse by topic
          </span>
          <Link
            href={blogHref("", view)}
            aria-current={tag ? undefined : "true"}
            className={
              tag
                ? "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-orange-300 hover:text-orange-700"
                : "rounded-full bg-orange-700 px-3 py-1 text-xs font-semibold text-white"
            }
          >
            All <span className="opacity-75">{posts.length}</span>
          </Link>
          {allTopics.map((t) => {
            const active = t.toLowerCase() === tag.toLowerCase();
            return (
              <Link
                key={t}
                href={active ? blogHref("", view) : blogHref(t, view)}
                aria-current={active ? "true" : undefined}
                className={
                  active
                    ? "rounded-full bg-orange-700 px-3 py-1 text-xs font-semibold text-white"
                    : "rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 hover:border-orange-300 hover:text-orange-700"
                }
              >
                {t} <span className="opacity-75">{topicCounts.get(t)}</span>
              </Link>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Sort and filter posts">
          <span className="text-xs font-semibold uppercase tracking-widest text-slate-600">Show</span>
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              href={blogHref(tag, v.id)}
              title={v.hint}
              aria-current={view === v.id ? "true" : undefined}
              className={
                view === v.id
                  ? "rounded-md bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                  : "rounded-md border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-400 hover:text-slate-900"
              }
            >
              {v.label}
            </Link>
          ))}
        </div>

        {filtering ? (
          <p className="mt-6 text-sm text-slate-600">
            Showing {filtered.length} {filtered.length === 1 ? "post" : "posts"}
            {tag ? <> tagged &ldquo;{tag}&rdquo;</> : null}
            {view !== "new" ? <> ({VIEWS.find((v) => v.id === view)?.hint.toLowerCase()})</> : null}.{" "}
            <Link href="/blog" className="font-medium text-orange-700 underline">
              Clear filters
            </Link>
          </p>
        ) : null}

        {filtered.length === 0 ? (
          <p className="mt-12 rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No posts match these filters yet.{" "}
            <Link href="/blog" className="font-medium text-orange-700 underline">
              Back to all posts
            </Link>
          </p>
        ) : null}

        {startHere.length > 0 ? (
          <div className="mt-6">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-600">
              New here? Start with one of these
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-3">
              {startHere.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/blog/${s.id}`}
                    className="flex h-full flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 transition hover:border-orange-300 hover:bg-white hover:shadow-sm"
                  >
                    <span className="text-sm font-semibold text-slate-900">{s.label}</span>
                    <span className="mt-1 line-clamp-2 text-sm text-slate-600">{s.post!.title}</span>
                    <span className="mt-2 text-sm font-semibold text-orange-700">Start here &rarr;</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {featured ? (
          <Link
            href={`/blog/${featured.id}`}
            className="group mt-6 grid overflow-hidden rounded-2xl border border-slate-200 transition hover:border-orange-300 hover:shadow-lg lg:grid-cols-[2fr_3fr]"
          >
            <div className="relative aspect-[16/10] overflow-hidden bg-slate-100 lg:aspect-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={featured.image}
                alt={featured.imageAlt}
                className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                loading="eager"
              />
              {postBadge(featured) ? <Badge label={postBadge(featured)!} /> : null}
            </div>
            <div className="flex flex-col justify-center p-6">
              <p className={`text-xs font-semibold uppercase tracking-widest ${topicStyle(featured.category).text}`}>
                {featured.category}
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 group-hover:text-orange-700 sm:text-2xl">
                {featured.title}
              </h2>
              <p className="mt-2 line-clamp-3 text-slate-600">{featured.summary}</p>
              <p className="mt-4 text-sm text-slate-600">
                By {featured.author} &middot; {formatBlogDate(featured.date)} &middot; {featured.readingTime}
              </p>
              <span className="mt-3 text-sm font-semibold text-orange-700 group-hover:underline">
                Read article &rarr;
              </span>
            </div>
          </Link>
        ) : null}

        {/* Posts in blocks of six, with a soft CTA between blocks (newsletter
            first, then the free course) instead of one unbroken wall. */}
        {Array.from({ length: Math.ceil(rest.length / ROW_SIZE) }, (_, bi) => {
          const chunk = rest.slice(bi * ROW_SIZE, (bi + 1) * ROW_SIZE);
          const more = (bi + 1) * ROW_SIZE < rest.length;
          return (
            <div key={bi}>
              <div className={`${bi === 0 ? "mt-8" : ""} ${GRID}`}>
                {chunk.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
              {more && bi === 0 ? <MidFeedNewsletter /> : null}
              {more && bi === 2 ? <MidFeedCourse /> : null}
              {more && bi !== 0 && bi !== 2 ? <div className="h-8" /> : null}
            </div>
          );
        })}

        <div className="mt-16 rounded-2xl border border-orange-200 bg-orange-50 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            Spend your time creating, not copy-pasting.
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-slate-600">
            Influencer Butler automates the busywork behind Amazon Creator
            Connections, daily deals, Benable, and Instagram outreach, so you can
            focus on the part only you can do.
          </p>
          <a
            href="/extension"
            className="mt-6 inline-block rounded-md bg-orange-600 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-700"
          >
            Start free
          </a>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
