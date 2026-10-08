import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import AffiliateTouch from "@/components/AffiliateTouch";
import BuildWeekCountdown from "./BuildWeekCountdown";
import EntryForm from "./EntryForm";
import ShareRow from "./ShareRow";
import { TrackView, TrackedLink } from "./BuildWeekTracking";
import {
  BUILD_WEEK_LOCALES,
  buildWeekCopy,
  resolveBuildWeekLocale,
  type BuildWeekLocale,
} from "./_copy";
import {
  BUILD_WEEK_DATES,
  BUILD_WEEK_GROUP_URL,
  BUILD_WEEK_MILESTONES,
  BUILD_WEEK_PAGE_PATH,
  BUILD_WEEK_RULES_PATH,
  isBuildWeekEnabled,
} from "@/lib/build-week";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://www.influencerbutler.com";

// Per-locale canonical: English is the clean URL, other languages carry ?lang=
// (the same scheme the blog uses), each with hreflang alternates and x-default.
function localeUrl(locale: BuildWeekLocale): string {
  return locale === "en-US"
    ? `${SITE}${BUILD_WEEK_PAGE_PATH}`
    : `${SITE}${BUILD_WEEK_PAGE_PATH}?lang=${locale}`;
}

type SearchParams = Promise<{ lang?: string; code?: string; s?: string }>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  // Until launch the page 404s, so make sure nothing about it can be indexed.
  if (!isBuildWeekEnabled()) {
    return { title: "Not found | Influencer Butler", robots: { index: false, follow: false } };
  }
  const locale = resolveBuildWeekLocale((await searchParams).lang);
  const copy = buildWeekCopy(locale);
  const languages: Record<string, string> = {};
  for (const l of BUILD_WEEK_LOCALES) languages[l] = localeUrl(l);
  languages["x-default"] = localeUrl("en-US");

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
    alternates: { canonical: localeUrl(locale), languages },
    robots: { index: true, follow: true },
    openGraph: {
      title: copy.metaTitle,
      description: copy.metaDescription,
      url: localeUrl(locale),
      siteName: "Influencer Butler",
      type: "website",
      locale: copy.ogLocale,
      alternateLocale: BUILD_WEEK_LOCALES.filter((l) => l !== locale).map(
        (l) => buildWeekCopy(l).ogLocale,
      ),
    },
    twitter: {
      card: "summary_large_image",
      title: copy.metaTitle,
      description: copy.metaDescription,
    },
  };
}

export default async function BuildWeekPage({ searchParams }: { searchParams: SearchParams }) {
  if (!isBuildWeekEnabled()) notFound();

  const locale = resolveBuildWeekLocale((await searchParams).lang);
  const copy = buildWeekCopy(locale);
  const pageUrl = localeUrl(locale);

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: copy.faq.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };
  const eventJsonLd = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: "Influencer Butler Build Week",
    description: copy.metaDescription,
    startDate: BUILD_WEEK_DATES.ideasOpen,
    endDate: BUILD_WEEK_DATES.buildDeadline,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OnlineEventAttendanceMode",
    location: { "@type": "VirtualLocation", url: pageUrl },
    organizer: { "@type": "Organization", name: "The Social Media Posse LLC", url: SITE },
    isAccessibleForFree: true,
    inLanguage: copy.htmlLang,
  };

  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={null}>
        <AffiliateTouch />
      </Suspense>
      <TrackView lang={locale} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(eventJsonLd) }} />

      <SiteHeader />

      <main id="main-content" lang={copy.htmlLang}>
        {/* Hero */}
        <section className="border-b border-slate-200 bg-gradient-to-b from-orange-50 to-white">
          <div className="mx-auto max-w-4xl px-6 py-14 text-center sm:py-20">
            <nav aria-label={copy.languageLabel} className="mb-6 flex justify-center gap-4 text-sm">
              {BUILD_WEEK_LOCALES.map((l) => (
                <a
                  key={l}
                  href={l === "en-US" ? BUILD_WEEK_PAGE_PATH : `${BUILD_WEEK_PAGE_PATH}?lang=${l}`}
                  hrefLang={buildWeekCopy(l).htmlLang}
                  lang={buildWeekCopy(l).htmlLang}
                  aria-current={l === locale ? "true" : undefined}
                  className={
                    l === locale
                      ? "font-semibold text-orange-800 underline"
                      : "text-slate-600 hover:text-orange-800"
                  }
                >
                  {buildWeekCopy(l).languageName}
                </a>
              ))}
            </nav>
            <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-800">
              {copy.eyebrow}
            </span>
            <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
              {copy.h1Lead} <span className="text-[#c2410c]">{copy.h1Accent}</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-700">{copy.heroBody}</p>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <TrackedLink
                href={BUILD_WEEK_GROUP_URL}
                event="build_week_enter_click"
                external
                className="inline-flex items-center justify-center rounded-[14px] bg-[#c2410c] px-7 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-[#9a3412] focus:outline-none focus:ring-2 focus:ring-orange-300"
              >
                {copy.ctaPrimary}
              </TrackedLink>
              <a
                href={BUILD_WEEK_RULES_PATH}
                className="inline-flex items-center justify-center rounded-[14px] border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-800 transition hover:border-orange-700 hover:text-orange-800"
              >
                {copy.ctaSecondary}
              </a>
            </div>
            <p className="mt-3 text-sm text-slate-600">{copy.heroNote}</p>

            <div className="mt-8 flex justify-center">
              <BuildWeekCountdown
                milestones={BUILD_WEEK_MILESTONES.map((m) => ({ key: m.key, at: m.at }))}
                labels={copy.countdown.labels}
                units={copy.countdown.units}
                aria={copy.countdown.aria}
                done={copy.countdown.done}
              />
            </div>
          </div>
        </section>

        {/* The guarantee */}
        <section className="mx-auto max-w-4xl px-6 py-14">
          <div className="rounded-2xl border-2 border-orange-300 bg-orange-50/60 p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{copy.promise.title}</h2>
            <p className="mt-3 text-lg text-slate-800">{copy.promise.body}</p>
            <p className="mt-4 text-sm text-slate-700">{copy.promise.fine}</p>
          </div>
        </section>

        {/* How it works */}
        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">{copy.steps.title}</h2>
            <ol className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {copy.steps.items.map((s, i) => (
                <li key={s.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#c2410c] text-sm font-bold text-white" aria-hidden="true">
                    {i + 1}
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-slate-900">{s.title}</h3>
                  <p className="mt-2 text-sm text-slate-700">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Timeline */}
        <section className="mx-auto max-w-3xl px-6 py-14">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">{copy.timeline.title}</h2>
          <ol className="mt-8 space-y-3">
            {copy.timeline.rows.map((r) => (
              <li key={r.when} className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-baseline sm:gap-6">
                <span className="shrink-0 text-sm font-bold text-orange-800 sm:w-56">{r.when}</span>
                <span className="text-sm text-slate-800">{r.what}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* What makes a good idea */}
        <section className="border-y border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-5xl px-6 py-14">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">{copy.ideas.title}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-center text-slate-700">{copy.ideas.intro}</p>
            <div className="mt-8 grid gap-6 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-200 bg-white p-6">
                <h3 className="text-base font-semibold text-slate-900">{copy.ideas.goodTitle}</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-800">
                  {copy.ideas.good.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="text-base font-semibold text-slate-900">{copy.ideas.notTitle}</h3>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-800">
                  {copy.ideas.not.map((g) => <li key={g}>{g}</li>)}
                </ul>
              </div>
            </div>
            <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-orange-200 bg-orange-50/60 p-6">
              <h3 className="text-base font-semibold text-slate-900">{copy.ideas.originTitle}</h3>
              <p className="mt-2 text-sm text-slate-800">{copy.ideas.origin}</p>
            </div>
          </div>
        </section>

        {/* Entry / claim form */}
        <section id="enter" className="bg-orange-50/50">
          <div className="mx-auto max-w-2xl px-6 py-14">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">{copy.form.title}</h2>
            <p className="mx-auto mb-8 mt-3 max-w-xl text-center text-slate-700">{copy.form.intro}</p>
            <EntryForm
              copy={copy.form}
              locale={locale}
              rulesHref={BUILD_WEEK_RULES_PATH}
              privacyHref="/legal/privacy"
            />
          </div>
        </section>

        {/* Share + pricing note + trial */}
        <section className="mx-auto max-w-3xl px-6 py-14 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">{copy.share.title}</h2>
          <div className="mt-5 flex justify-center">
            <ShareRow
              url={pageUrl}
              title={copy.share.shareTitle}
              text={copy.share.text}
              labels={{
                on: copy.share.on,
                email: copy.share.email,
                copyLink: copy.share.copyLink,
                copied: copy.share.copied,
              }}
            />
          </div>
          <p className="mt-10 text-sm text-slate-700">{copy.price}</p>
          <div className="mt-4">
            <a
              href="/go/trial?src=build-week"
              className="inline-flex items-center justify-center rounded-[14px] border border-orange-700 px-6 py-3 text-sm font-semibold text-orange-800 transition hover:bg-orange-50"
            >
              {copy.trial}
            </a>
          </div>
        </section>

        {/* FAQ */}
        <section className="border-t border-slate-200 bg-slate-50">
          <div className="mx-auto max-w-3xl px-6 py-14">
            <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">{copy.faqTitle}</h2>
            <div className="mt-8 space-y-3">
              {copy.faq.map((item) => (
                <details key={item.q} className="group rounded-xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer text-base font-semibold text-slate-900">{item.q}</summary>
                  <p className="mt-3 text-sm text-slate-800">{item.a}</p>
                </details>
              ))}
            </div>
            <p className="mt-8 text-center text-xs text-slate-600">
              {copy.rulesNote}{" "}
              <a href={BUILD_WEEK_RULES_PATH} className="font-medium text-orange-800 underline">
                {copy.ctaSecondary}
              </a>
            </p>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
