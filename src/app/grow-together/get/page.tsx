import type { Metadata } from "next";
import { SiteHeader, SiteFooter } from "@/components/blog/SiteChrome";
import BundleDownload from "./_components/BundleDownload";
import { BUNDLE_NAME, BUNDLE_TOPICS } from "../_data/bundleMeta";

export const metadata: Metadata = {
  title: `${BUNDLE_NAME}: the free creator guide`,
  description:
    "A free guide written by a group of Amazon, Walmart, and social creators. Real advice on growing your audience and turning it into commissions. Get your copy.",
  // This becomes an evergreen freebie after launch; let it be indexed.
  robots: { index: true, follow: true },
};

export default function GrowTogetherGetPage() {
  return (
    <div className="min-h-screen bg-white">
      <SiteHeader />

      <main>
        <section className="border-b border-slate-200 bg-gradient-to-b from-orange-50 to-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 lg:grid-cols-2 lg:items-center">
            <div>
              <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-orange-700">
                Free download
              </span>
              <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                {BUNDLE_NAME}
              </h1>
              <p className="mt-4 text-lg text-slate-600">
                One guide, packed with the best advice from a whole group of creators who are actually
                doing this. No fluff, no gatekeeping, just what works, from storefront setup to landing
                brand deals.
              </p>
              <ul className="mt-6 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2"><span className="text-orange-600">✓</span> Written by working Amazon, Walmart, and social creators</li>
                <li className="flex gap-2"><span className="text-orange-600">✓</span> Practical chapters you can act on the same day</li>
                <li className="flex gap-2"><span className="text-orange-600">✓</span> Completely free, yours to keep</li>
              </ul>
            </div>
            <div>
              <BundleDownload />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-16">
          <h2 className="text-center text-3xl font-bold tracking-tight text-slate-900">
            What is inside
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            A chapter on each of the things creators ask about most.
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
      </main>

      <SiteFooter />
    </div>
  );
}
