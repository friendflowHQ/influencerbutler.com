// Presentational building blocks shared by every /tools page. All server
// components (no client state) so they can be composed inside the page's
// Server Component. Styling mirrors src/app/affiliates/page.tsx.

import Link from "next/link";
import { TOOLS } from "./toolsMeta";

/** Hero band: eyebrow label + big headline + subtitle. */
export function ToolHero({
  eyebrow,
  title,
  highlight,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  /** Optional trailing phrase rendered in the orange gradient. */
  highlight?: string;
  subtitle: string;
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-white">
      <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#f97316]/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative mx-auto max-w-4xl px-6 py-16 text-center lg:py-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#f97316]/30 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          {eyebrow}
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
          {title}
          {highlight ? (
            <>
              {" "}
              <span className="bg-gradient-to-r from-[#f97316] to-amber-500 bg-clip-text text-transparent">
                {highlight}
              </span>
            </>
          ) : null}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">{subtitle}</p>
      </div>
    </section>
  );
}

/**
 * Final call-to-action band. `src` is appended to /go/download so trial clicks
 * are attributed to the specific tool page.
 */
export function ToolCTA({
  src,
  heading = "Ready to automate the busywork?",
  body = "Influencer Butler runs the repetitive parts of the Amazon-influencer hustle for you: outreach, reposts, deal hunting, and more. Start free, no card required.",
}: {
  src: string;
  heading?: string;
  body?: string;
}) {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16">
      <div className="rounded-3xl bg-gradient-to-br from-[#f97316] to-amber-500 p-10 text-center text-white shadow-xl sm:p-14">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{heading}</h2>
        <p className="mx-auto mt-4 max-w-2xl text-white/90">{body}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={`/go/download?src=${src}`}
            className="rounded-xl bg-white px-6 py-3 text-base font-semibold text-[#f97316] shadow-sm transition hover:bg-orange-50"
          >
            Start free →
          </a>
          <Link
            href="/tools"
            className="rounded-xl border border-white/60 bg-transparent px-6 py-3 text-base font-semibold text-white transition hover:bg-white/10"
          >
            Browse all free tools
          </Link>
        </div>
      </div>
    </section>
  );
}

/**
 * "More free tools" grid, excluding the current tool. Renders every other tool
 * as a card linking to its page.
 */
export function RelatedTools({ currentSlug }: { currentSlug?: string }) {
  const others = TOOLS.filter((t) => t.slug !== currentSlug);
  return (
    <section className="bg-slate-50 py-16">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          More free tools
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Keep the momentum going.
        </h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {others.map((t) => (
            <Link
              key={t.slug}
              href={`/tools/${t.slug}`}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-[#f97316] hover:shadow-md"
            >
              <span className="text-3xl" aria-hidden>
                {t.icon}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-slate-900 group-hover:text-[#f97316]">
                {t.title}
              </h3>
              <p className="mt-2 text-sm text-slate-600">{t.tagline}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
