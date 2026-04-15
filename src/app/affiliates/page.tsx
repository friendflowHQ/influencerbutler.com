import Link from "next/link";
import Image from "next/image";
import EarningsCalculator from "./EarningsCalculator";
import FaqAccordion from "./FaqAccordion";

export const metadata = {
  title: "Affiliate Program — Earn 35% Recurring | Influencer Butler",
  description:
    "Promote Influencer Butler and earn 35% recurring commission on every subscription, for as long as your referrals stay subscribed. 30-day cookie, last-click attribution.",
};

export default function AffiliatesLandingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      {/* Top nav */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
          <div className="flex items-center gap-2">
            <Link
              href="/login?next=/dashboard/affiliates"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Affiliate login
            </Link>
            <Link
              href="/affiliates/apply"
              className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Apply now
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#f97316]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 lg:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f97316]/30 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
            Partner Program
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Get paid to champion{" "}
            <span className="bg-gradient-to-r from-[#f97316] to-amber-500 bg-clip-text text-transparent">
              Influencer Butler.
            </span>
            <br className="hidden sm:block" /> 35% recurring. Forever.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            Every subscription you refer pays you <strong>35% every month</strong> for as long as they stay a
            customer. No caps. No expiring tiers. Real creators making real recurring income.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/affiliates/apply"
              className="rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Apply in 2 minutes →
            </Link>
            <Link
              href="/login?next=/dashboard/affiliates"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:border-[#f97316] hover:text-[#f97316]"
            >
              Affiliate login
            </Link>
          </div>

          <dl className="mt-14 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { k: "35%", v: "Recurring commission" },
              { k: "30-day", v: "Referral cookie" },
              { k: "Last-click", v: "Attribution" },
              { k: "Monthly", v: "Payouts" },
            ].map((stat) => (
              <div key={stat.k} className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.v}</dt>
                <dd className="mt-1 text-2xl font-bold text-slate-900">{stat.k}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Earnings calculator */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Earnings calculator</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              See what your audience is worth.
            </h2>
          </div>
          <p className="max-w-md text-sm text-slate-600">
            Drag the slider to see estimated monthly and yearly commissions — assumes an average plan price of
            $49/month, paid continuously while referrals remain subscribed.
          </p>
        </div>
        <div className="mt-8">
          <EarningsCalculator />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">How it works</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps. That&apos;s it.
          </h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Apply",
                body:
                  "Tell us about your audience and how you plan to promote. Most applications are reviewed within 48 hours.",
              },
              {
                step: "02",
                title: "Get your link",
                body:
                  "Once approved, log in to your portal to grab your unique referral link, track clicks, and see earnings in real time.",
              },
              {
                step: "03",
                title: "Earn recurring",
                body:
                  "Every subscription you refer pays you 35% every month. Payouts go out monthly via Lemon Squeezy.",
              },
            ].map((s) => (
              <article
                key={s.step}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <p className="font-mono text-sm font-bold text-[#f97316]">{s.step}</p>
                <h3 className="mt-3 text-xl font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm text-slate-600">{s.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Commission breakdown */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl bg-gradient-to-br from-[#f97316] to-amber-500 p-10 text-white shadow-xl sm:p-14">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white/80">The deal</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Built for creators who want real recurring income.
          </h2>
          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            <div>
              <p className="text-5xl font-black tracking-tight">35%</p>
              <p className="mt-2 text-sm text-white/90">
                Recurring commission on every subscription — for as long as the customer stays subscribed.
              </p>
            </div>
            <div>
              <p className="text-5xl font-black tracking-tight">30</p>
              <p className="mt-2 text-sm text-white/90">
                Day referral cookie. If they click your link once and subscribe within a month, you get credit.
              </p>
            </div>
            <div>
              <p className="text-5xl font-black tracking-tight">∞</p>
              <p className="mt-2 text-sm text-white/90">
                No commission caps. No tier drops. Last-click attribution — the last referrer gets the sale.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Who it&apos;s for</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Made for creators who live in this world.
            </h2>
            <p className="mt-4 text-slate-600">
              Our best affiliates are people who already talk to creators, agencies, or sellers every day. If
              your audience cares about Amazon, short-form video, or automating their hustle — this is a
              natural fit.
            </p>
          </div>
          <ul className="grid gap-3">
            {[
              "Amazon Influencers with an engaged audience",
              "Creator-economy YouTubers, newsletters, and podcasters",
              "Agencies managing multiple influencer clients",
              "Coaches and educators teaching affiliate marketing",
              "Tool-review creators who love new software",
            ].map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <span className="mt-0.5 inline-flex h-6 w-6 flex-none items-center justify-center rounded-full bg-[#f97316]/10 text-[#f97316]">
                  ✓
                </span>
                <span className="text-sm text-slate-700">{item}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">FAQ</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Frequently asked questions</h2>
          <div className="mt-10">
            <FaqAccordion />
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-5xl">
          Turn your audience into <span className="text-[#f97316]">recurring income.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          Spots are reviewed weekly. Apply now — it takes about two minutes.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/affiliates/apply"
            className="rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
          >
            Apply in 2 minutes →
          </Link>
          <Link
            href="/login?next=/dashboard/affiliates"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:border-[#f97316] hover:text-[#f97316]"
          >
            Already approved? Log in
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#fafafa] pt-14 pb-8">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2">
              <Image
                src="/assets/influencer-butler-logo.png"
                alt="Influencer Butler logo"
                width={36}
                height={36}
                className="rounded"
              />
              <span className="text-sm font-semibold tracking-tight">Influencer Butler</span>
            </Link>
            <p className="mt-3 max-w-[260px] text-sm text-slate-500">
              The all-in-one command center for Amazon Influencers.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <h4 className="mb-1 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">Product</h4>
            <a href="/#features" className="text-sm text-slate-500 transition hover:text-[#f97316]">Features</a>
            <a href="/#pricing" className="text-sm text-slate-500 transition hover:text-[#f97316]">Pricing</a>
            <a href="/#how-it-works" className="text-sm text-slate-500 transition hover:text-[#f97316]">How It Works</a>
            <a href="/#faq" className="text-sm text-slate-500 transition hover:text-[#f97316]">FAQ</a>
            <Link href="/affiliates" className="text-sm text-slate-500 transition hover:text-[#f97316]">Affiliates — Earn 35%</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <h4 className="mb-1 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">Legal</h4>
            <a href="/legal/privacy.html" className="text-sm text-slate-500 transition hover:text-[#f97316]">Privacy Policy</a>
            <a href="/legal/eula.html" className="text-sm text-slate-500 transition hover:text-[#f97316]">EULA</a>
            <a href="/legal/terms.html" className="text-sm text-slate-500 transition hover:text-[#f97316]">Terms of Service</a>
          </div>
          <div className="flex flex-col gap-2.5">
            <h4 className="mb-1 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">Support</h4>
            <a href="mailto:hello@influencerbutler.com" className="text-sm text-slate-500 transition hover:text-[#f97316]">Contact Us</a>
            <Link href="/dashboard" className="text-sm text-slate-500 transition hover:text-[#f97316]">My Account</Link>
          </div>
        </div>
        <div className="mx-auto mt-10 max-w-6xl border-t border-slate-200 px-6 pt-6">
          <p className="text-center text-xs text-slate-500">
            © {new Date().getFullYear()} The Social Media Posse LLC. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
