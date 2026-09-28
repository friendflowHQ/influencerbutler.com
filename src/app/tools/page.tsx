import Link from "next/link";
import { TOOLS } from "./_components/toolsMeta";
import { ToolCTA } from "./_components/ToolShell";

export const metadata = {
  title: "Free Tools for Amazon Influencers",
  description:
    "Free, no-signup calculators and generators for Amazon influencers and affiliates: earnings calculator, sales estimator, engagement rate calculator, hashtag generator, and link builder.",
};

export default function ToolsHubPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#f97316]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-6 py-16 text-center lg:py-24">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f97316]/30 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
            Free Tools
          </span>
          <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Free tools for{" "}
            <span className="bg-gradient-to-r from-[#f97316] to-amber-500 bg-clip-text text-transparent">
              Amazon influencers.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            Quick calculators and generators to plan your commissions, size up products, and grow
            your audience. No signup, no catch. Built by the team behind Influencer Butler.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map((t) => (
            <Link
              key={t.slug}
              href={`/tools/${t.slug}`}
              className="group flex flex-col rounded-2xl border border-slate-200 bg-white p-7 shadow-sm transition hover:border-[#f97316] hover:shadow-md"
            >
              <div className="flex items-center justify-between">
                <span className="text-4xl" aria-hidden>
                  {t.icon}
                </span>
                <span className="rounded-full bg-[#f97316]/10 px-3 py-1 text-xs font-semibold text-[#f97316]">
                  {t.badge}
                </span>
              </div>
              <h2 className="mt-5 text-xl font-semibold text-slate-900 group-hover:text-[#f97316]">
                {t.title}
              </h2>
              <p className="mt-2 flex-1 text-sm text-slate-600">{t.tagline}</p>
              <span className="mt-5 text-sm font-semibold text-[#f97316]">Open tool →</span>
            </Link>
          ))}
        </div>
      </section>

      <ToolCTA
        src="tool-hub"
        heading="Free tools are just the start."
        body="Influencer Butler automates the repetitive parts of the Amazon-influencer hustle so you can focus on making content. Start free, no card required."
      />
    </>
  );
}
