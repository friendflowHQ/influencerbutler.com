import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import ContributorForm from "./_components/ContributorForm";
import {
  BUNDLE_NAME,
  BUNDLE_TOPICS,
  BUNDLE_DATES,
  TOTAL_SLOTS,
  formatBundleDate,
} from "./_data/bundleMeta";

// A time-limited recruitment page, not evergreen SEO: keep it out of the index.
export const metadata: Metadata = {
  title: `${BUNDLE_NAME}: contribute a chapter`,
  description:
    "Team up with other Amazon, Walmart, and social creators on a free giveaway bundle. Write one chapter, promote it once, and grow your email list with every other creator's audience.",
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    n: "1",
    title: "Claim your topic",
    body: "Pick the one thing you are great at and apply below. Each topic has limited spots so chapters stay fresh.",
  },
  {
    n: "2",
    title: "Write one chapter",
    body: `Share your best advice on your topic, a few pages, in your own voice. Drafts are due ${formatBundleDate(BUNDLE_DATES.submissionDeadline)}.`,
  },
  {
    n: "3",
    title: "Promote it once, together",
    body: `During launch week (${formatBundleDate(BUNDLE_DATES.launchDate)}) we all share the finished bundle with our audiences on the same days.`,
  },
  {
    n: "4",
    title: "Grow your list",
    body: "Everyone who downloads the bundle opts in to hear from the contributors. You get the shared list as your reward.",
  },
];

export default function GrowTogetherPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <main>
        {/* Hero */}
        <section className="border-b border-slate-200 bg-gradient-to-b from-orange-50 to-white">
          <div className="mx-auto max-w-4xl px-6 py-16 text-center sm:py-20">
            <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-700">
              Calling creators
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
              {BUNDLE_NAME}
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
              A free giveaway guide, written by creators, for creators. You contribute one chapter on
              what you do best. Then we all share it with our audiences at the same time, and every
              contributor grows their email list from everyone else&rsquo;s reach.
            </p>
            <div className="mt-8">
              <a
                href="#apply"
                className="inline-flex items-center justify-center rounded-[14px] bg-orange-600 px-7 py-3.5 text-base font-semibold text-white shadow-[0_2px_8px_rgba(234,88,12,0.3)] transition hover:bg-orange-700"
              >
                Claim your topic
              </a>
              <p className="mt-3 text-sm text-slate-500">
                Free to join. Applications close {formatBundleDate(BUNDLE_DATES.recruitClose)}.
              </p>
            </div>
          </div>
        </section>

        {/* Why join */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Why creators join a bundle
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            A bundle is the fastest, most fun way to grow your email list. Instead of chasing the
            algorithm alone, a group of creators pool their audiences for one launch.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-2xl">📈</div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Borrow every audience</h3>
              <p className="mt-2 text-sm text-slate-600">
                Your one chapter gets promoted by every other contributor. Their followers become your
                subscribers, and yours become theirs.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-2xl">✍️</div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Low effort, high payoff</h3>
              <p className="mt-2 text-sm text-slate-600">
                Write a few pages once. Promote once. You walk away with new subscribers and a credit
                in a polished guide you can show off.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="text-2xl">🤝</div>
              <h3 className="mt-3 text-lg font-semibold text-slate-900">Real relationships</h3>
              <p className="mt-2 text-sm text-slate-600">
                You meet other creators in your space, cross-promote for months to come, and become
                part of a group that lifts each other up.
              </p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl px-6 py-16">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              How it works
            </h2>
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((s) => (
                <div key={s.n} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-600 text-sm font-bold text-white">
                    {s.n}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{s.body}</p>
                </div>
              ))}
            </div>
            <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-slate-500">
              The list-sharing is on the up-and-up: everyone who downloads the finished bundle is told
              clearly that their email is shared with the contributing creators, and they can
              unsubscribe from any of us any time.
            </p>
          </div>
        </section>

        {/* Topics */}
        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            Pick your chapter
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            {TOTAL_SLOTS} spots across the topics below. Choose the one you could talk about all day.
            The application shows which topics still have room.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BUNDLE_TOPICS.map((t) => (
              <div key={t.slug} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-900">{t.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600">{t.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Apply */}
        <section id="apply" className="border-t border-slate-200 bg-orange-50/50">
          <div className="mx-auto max-w-3xl px-6 py-16">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
              Apply to contribute
            </h2>
            <p className="mx-auto mt-3 mb-8 max-w-xl text-center text-slate-600">
              Takes two minutes. We will email you your topic, exactly what to send, and the timeline.
            </p>
            <ContributorForm />
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
