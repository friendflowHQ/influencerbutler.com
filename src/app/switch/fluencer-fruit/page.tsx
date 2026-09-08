import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import FacebookGroupIconLink from "@/components/FacebookGroupIconLink";
import {
  FLUENCER_FRUIT_CLOSES,
  SURFACE_LABEL,
  SWITCH_OFFER_WEEKS,
  SWITCH_ROWS,
} from "@/lib/switch-fluencer-fruit";
import SwitchOfferCta from "./SwitchOfferCta";
import SwitchEmailCapture from "./SwitchEmailCapture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE = "https://www.influencerbutler.com";
const PATH = "/switch/fluencer-fruit";
const DESCRIPTION =
  "Fluencer Fruit retires at the end of September 2026. Here is what maps to what in Influencer Butler, feature by feature, plus a 14-day full-Pro trial with everything unlocked.";

// Indexable on purpose: this is the page people searching "Fluencer Fruit
// closing" or "Fluencer Fruit alternative" should land on. The offer block
// itself is gated by FLUENCER_SWITCH_ENABLED so the page can go live before the
// Lemon Squeezy code exists.
export const metadata: Metadata = {
  title: "Switching from Fluencer Fruit | Influencer Butler",
  description: DESCRIPTION,
  alternates: { canonical: `${SITE}${PATH}` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Switching from Fluencer Fruit",
    description: DESCRIPTION,
    url: `${SITE}${PATH}`,
    siteName: "Influencer Butler",
    type: "article",
    images: [{ url: `${SITE}/assets/influencer-butler-og-image.png` }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Switching from Fluencer Fruit",
    description: DESCRIPTION,
    images: [`${SITE}/assets/influencer-butler-og-image.png`],
  },
};

const KEEP_POINTS = [
  {
    title: "A full-Pro trial, everything unlocked",
    body: "14 days of every Pro butler, not a capped preview. Product research, Campaign Radar, and the whole extension stay free after the trial too.",
  },
  {
    title: "Cancel from the dashboard in one click",
    body: "No support ticket, no retention call. You keep access until the end of the period you paid for.",
  },
  {
    title: "No per-message fees",
    body: "Message templates and AI drafts for Creator Connections are unlimited. Nothing is metered by credits, on the extension or in the app.",
  },
  {
    title: "Works while you are away",
    body: "The desktop app runs on your Windows or Mac machine, so campaign acceptance, outreach, and deal posting keep going after you close the browser.",
  },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "When does Fluencer Fruit close?",
    a: `Fluencer Fruit has said it retires at ${FLUENCER_FRUIT_CLOSES}. Export anything you want to keep before then; nothing from that account carries over on its own.`,
  },
  {
    q: "Is the extension really free?",
    a: "Yes. The Chrome extension needs no login and no card. Butler Score, BSR and estimated revenue, Video Scanner, Campaign Radar, Get link, and Global Maximizer all work on the free tier with no caps or credits.",
  },
  {
    q: "What does the switch offer include?",
    a: `When the offer is live, the checkout applies the FRUITSWITCH code: your first ${SWITCH_OFFER_WEEKS} weeks of Pro (Solo monthly) free. A card holds your spot, you are not charged during those weeks, and you can cancel from the dashboard before they end. After that it is $39/month.`,
  },
  {
    q: "What if I only used Fluencer Fruit for product research?",
    a: "Then you may never need to pay. Butler Score, price and rank history, Video Scanner, and Trend Radar live in the free extension. Start there and add the desktop app only if you want the automation.",
  },
  {
    q: "Do I have to run a desktop app?",
    a: "Not for research, campaigns, or links: those live in the extension. The desktop app is where the automation lives (auto-accept, outreach, Video Reload, Earnings Intelligence). Both talk to each other when paired.",
  },
  {
    q: "Is there a mobile app?",
    a: "Not yet. Mobile Butler is coming. Today, Get link in the extension already builds links that open the Amazon app on a phone, and the web dashboard works on any screen.",
  },
];

export default async function SwitchFluencerFruitPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  // Offer stays dark until (1) the FRUITSWITCH discount exists in Lemon
  // Squeezy and (2) this flag is set; otherwise the page falls back to the
  // normal 14-day full-Pro trial CTA so nothing promises a price it cannot show.
  const offerEnabled = process.env.FLUENCER_SWITCH_ENABLED === "1";
  const ref = (await searchParams).ref ?? null;
  const trialHref = "/go/download?src=switch-fruit";

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-white text-slate-900">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/assets/influencer-butler-logo.png"
            alt="Influencer Butler logo"
            width={32}
            height={32}
            className="rounded"
            priority
          />
          <span className="text-sm font-semibold tracking-tight">Influencer Butler</span>
        </Link>

        {/* Hero */}
        <section className="mt-10">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f97316] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Switch guide
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl">
            Fluencer Fruit is closing.{" "}
            {offerEnabled ? (
              <span className="text-[#c2410c]">Your first six weeks of Pro are free.</span>
            ) : (
              <span className="text-[#c2410c]">Your first 14 days of Pro are free.</span>
            )}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-slate-600">
            Fluencer Fruit retires at {FLUENCER_FRUIT_CLOSES}. If it was your product finder,
            campaign finder, or deep-link tool, here is exactly where each of those jobs lives in
            Influencer Butler, what it costs (most of it is free), and how to start without
            learning a new workflow from scratch.
          </p>
        </section>

        {/* Offer block */}
        <section className="mt-10 rounded-2xl border-2 border-[#f97316]/40 bg-white p-8 shadow-sm">
          {offerEnabled ? (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c2410c]">
                Switch offer
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                {SWITCH_OFFER_WEEKS} weeks of Influencer Butler Pro, free.
              </h2>
              <p className="mt-3 text-slate-600">
                Three times the normal trial, so you have the whole of Fluencer Fruit&apos;s wind-down
                and then some to move over at your own pace. Every Pro butler unlocked from day one:
                auto-accept, outreach, Video Reload, YouTube Butler, Earnings Intelligence, and the
                rest.
              </p>
              <SwitchOfferCta refCode={ref} />
              <p className="mt-4 text-xs text-slate-500">
                A card is required to hold your spot, and you will not be charged during your{" "}
                {SWITCH_OFFER_WEEKS} free weeks. After that it is $39/month, and you can cancel any time
                from your dashboard before then. The offer ends when Fluencer Fruit does.
              </p>
            </>
          ) : (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#c2410c]">
                Full-Pro trial
              </span>
              <h2 className="mt-4 text-2xl font-bold tracking-tight sm:text-3xl">
                Start your 14-day full-Pro trial.
              </h2>
              <p className="mt-3 text-slate-600">
                Everything unlocked, not a capped preview: auto-accept, outreach, Video Reload,
                YouTube Butler, Earnings Intelligence, and the rest. The Chrome extension stays free
                forever either way.
              </p>
              <a
                href={trialHref}
                className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
              >
                Start your 14-day full-Pro trial
              </a>
              <p className="mt-4 text-xs text-slate-500">
                Windows and Mac. Cancel any time from your dashboard in one click.
              </p>
            </>
          )}
        </section>

        {/* What maps to what */}
        <section className="mt-16" id="map">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What maps to what</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            The Fluencer Fruit column is deliberately generic: we describe their features only in
            the terms they were commonly known by. The Influencer Butler column names the exact
            surface, the product it lives in, and the plan it needs.
          </p>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">Fluencer Fruit</th>
                  <th className="px-4 py-3 font-semibold text-[#c2410c]">Influencer Butler</th>
                  <th className="px-4 py-3 font-semibold">Lives in</th>
                  <th className="px-4 py-3 font-semibold">Plan</th>
                  <th className="px-4 py-3 font-semibold">Where to find it</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {SWITCH_ROWS.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.theirs}</td>
                    <td className="bg-orange-50/60 px-4 py-3 font-medium text-slate-900">{row.ours}</td>
                    <td className="px-4 py-3 text-slate-700">{SURFACE_LABEL[row.surface]}</td>
                    <td className="px-4 py-3">
                      <PlanPill plan={row.plan} />
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.where}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Free means no login and no card in the Chrome extension. Pro means the desktop app on
            a trial or paid plan. All plans means the web dashboard, including the free tier.
          </p>
        </section>

        {/* Keep what you were used to */}
        <section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Keep what you were used to</h2>
          <p className="mt-3 max-w-2xl text-slate-600">
            A public tool comparison this month claimed no tool offers a full-Pro free trial. We
            do, and it has been that way since launch. Here is what stays simple.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {KEEP_POINTS.map((point) => (
              <li
                key={point.title}
                className="flex items-start gap-3 rounded-xl border border-orange-100 bg-orange-50/60 p-4"
              >
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#f97316]"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <div>
                  <p className="font-semibold text-slate-900">{point.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{point.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Email capture */}
        <section className="mt-16 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-2xl font-bold tracking-tight">Get the map by email</h2>
          <p className="mt-2 max-w-2xl text-slate-600">
            Five short emails over two weeks: the feature-by-feature map, a product research
            walkthrough, campaigns, links and cross-posting, and a reminder before Fluencer Fruit
            closes. One-click unsubscribe on every one.
          </p>
          <div className="mt-5">
            <SwitchEmailCapture />
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-16" id="faq">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions people ask</h2>
          <ul className="mt-6 divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {FAQ.map(({ q, a }) => (
              <li key={q}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-slate-900 hover:bg-slate-50 sm:px-6 sm:text-base">
                    <span>{q}</span>
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      className="flex-shrink-0 text-slate-400 transition group-open:rotate-180"
                    >
                      <path
                        d="m6 9 6 6 6-6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </summary>
                  <p className="px-5 pb-5 text-sm text-slate-600 sm:px-6">{a}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>

        <p className="mt-12 text-center text-sm text-slate-500">
          Already a member?{" "}
          <Link href="/dashboard" className="font-semibold text-slate-600 underline hover:text-[#f97316]">
            Go to your dashboard
          </Link>
          . Want the wider picture?{" "}
          <a
            href="/compare/fluencer-fruit-alternatives"
            className="font-semibold text-slate-600 underline hover:text-[#f97316]"
          >
            Read the Fluencer Fruit alternatives roundup
          </a>
          .
        </p>
      </div>

      <SiteFooter />
    </main>
  );
}

function PlanPill({ plan }: { plan: "Free" | "Pro" | "All plans" | "Coming" }) {
  const cls =
    plan === "Free"
      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
      : plan === "Pro"
        ? "bg-orange-50 text-[#c2410c] border-orange-200"
        : plan === "All plans"
          ? "bg-sky-50 text-sky-800 border-sky-200"
          : "bg-slate-100 text-slate-600 border-slate-200";
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {plan}
    </span>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-slate-900">
              <Image
                src="/assets/influencer-butler-logo.png"
                alt="Influencer Butler"
                width={36}
                height={36}
                className="rounded"
              />
              <span className="text-sm font-semibold tracking-tight">Influencer Butler</span>
            </Link>
            <p className="mt-3 text-sm text-slate-600">
              The all-in-one command center for creators and influencers.
            </p>
            <FacebookGroupIconLink className="mt-4" />
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">Product</h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link href="/#features" className="hover:text-[#f97316]">Features</Link></li>
              <li><Link href="/pricing" className="hover:text-[#f97316]">Pricing</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-[#f97316]">How It Works</Link></li>
              <li><Link href="#faq" className="hover:text-[#f97316]">FAQ</Link></li>
              <li><Link href="/course/amazon-influencer" className="hover:text-[#f97316]">Free Amazon Influencer Course</Link></li>
              <li><Link href="/affiliates" className="hover:text-[#f97316]">Affiliates - Earn 30%</Link></li>
              <li><Link href="/download" className="hover:text-[#f97316]">Download the App</Link></li>
              <li><Link href="/extension" className="hover:text-[#f97316]">Chrome Extension: Free</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">Legal</h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link href="/legal/privacy" className="hover:text-[#f97316]">Privacy Policy</Link></li>
              <li><Link href="/legal/eula" className="hover:text-[#f97316]">EULA</Link></li>
              <li><Link href="/legal/terms" className="hover:text-[#f97316]">Terms of Service</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">Support</h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link href="/contact" className="hover:text-[#f97316]">Contact Us</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#f97316]">My Account</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
          &copy; {new Date().getFullYear()} The Social Media Posse LLC. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
