import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Free Amazon Influencer Chrome Extension | Influencer Butler",
  description:
    "See influencer vs brand video counts on any Amazon product, find content gaps in your own orders, spot Butler Approved opportunities, and check your storefront. 100% free.",
};

// Single spot to update when the Chrome Web Store listing goes live.
const CHROME_STORE_URL = "#install";

const TOOLS = [
  {
    name: "Video Scanner",
    tagline: "Know the carousel before you film",
    description:
      "On any Amazon product page, instantly see how many videos it has and who made them: influencer, brand, or customer. The exact intel other tools charge monthly for, free while you browse.",
  },
  {
    name: "Content Gap Finder",
    tagline: "Film what you already own",
    description:
      "Scan your own Amazon order history and surface products you bought that have few or zero influencer videos. Those are the easiest wins on Amazon: you own the product and can film today.",
  },
  {
    name: "Butler Approved Seal",
    tagline: "A green light you can trust",
    description:
      "A product earns the seal when it is actively selling, has an open influencer slot in the carousel, is in stock, and clears your price floor. Every criterion is shown pass or fail, so you know why.",
  },
  {
    name: "Storefront Checkup",
    tagline: "Stop leaking commissions",
    description:
      "One click checks your storefront videos for missing product tags, over-tagging that dilutes clicks, and tagged products that have gone unavailable.",
  },
];

const COMPARISON: Array<{ feature: string; ib: string; others: string }> = [
  { feature: "Price", ib: "Free", others: "$25-$50/mo" },
  { feature: "Influencer vs brand vs customer video counts", ib: "Yes", others: "Sometimes" },
  { feature: "Content gaps from your order history", ib: "Yes", others: "Usually a paid tier" },
  { feature: "Opportunity seal with visible criteria", ib: "Yes", others: "Rarely" },
  { feature: "Break-even and profit math on the page", ib: "Yes", others: "Sometimes" },
  { feature: "Storefront untagged and dead-product checks", ib: "Yes", others: "Usually a paid tier" },
  { feature: "Syncs with a full automation suite (42+ butlers)", ib: "Yes", others: "No" },
];

const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes. Every tool in the extension works without an account and without a card. If you also use the Influencer Butler desktop app, connecting your license key syncs your findings to your dashboard, but that is optional.",
  },
  {
    q: "Do I need the desktop app?",
    a: "No. The extension stands on its own. The desktop app adds the automation side: posting, deal harvesting, Creator Connections outreach, and more, and the two are better together.",
  },
  {
    q: "How does it count influencer videos?",
    a: "It reads the video carousel data already on the product page you are viewing and classifies each video by its creator type. Nothing is crawled in the background; scans of your orders and storefront only run when you click the button.",
  },
  {
    q: "Is my data private?",
    a: "The extension stores everything locally in your browser. Findings leave your machine only if you connect your license key and keep sync turned on, and then only to your own Influencer Butler dashboard. No tracking, no analytics, no sale of data: read the full extension privacy policy at influencerbutler.com/extension/privacy.",
  },
  {
    q: "Which marketplaces are supported?",
    a: "Amazon.com at launch. Additional marketplaces are on the roadmap.",
  },
];

export default function ExtensionLandingPage() {
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
              href="/#pricing"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Pricing
            </Link>
            <Link
              href="/login?next=/dashboard/extension"
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Log in
            </Link>
            <a
              href={CHROME_STORE_URL}
              className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Add to Chrome - Free
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-orange-50 via-white to-white">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-[#f97316]/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-amber-200/40 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-6 py-20 lg:py-28">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f97316]/30 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
            Free Chrome Extension
          </span>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            The Amazon intel other tools{" "}
            <span className="bg-gradient-to-r from-[#f97316] to-amber-500 bg-clip-text text-transparent">
              charge $30/month for.
            </span>
            <br className="hidden sm:block" /> Free. Forever.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            See how many influencer videos any product has, find content gaps in your own orders,
            spot Butler Approved opportunities, and keep your storefront healthy: all while you
            browse Amazon like normal.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href={CHROME_STORE_URL}
              id="install"
              className="rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Add to Chrome - it&apos;s free →
            </a>
            <Link
              href="/dashboard/extension"
              className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:border-[#f97316] hover:text-[#f97316]"
            >
              See your synced data
            </Link>
          </div>

          <dl className="mt-14 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { k: "$0", v: "Every tool, no card" },
              { k: "4", v: "Tools in your browser" },
              { k: "1-click", v: "Order history scan" },
              { k: "42+", v: "Butlers it syncs with" },
            ].map((stat) => (
              <div key={stat.k} className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.v}</dt>
                <dd className="mt-1 text-2xl font-bold text-slate-900">{stat.k}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Tools */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">The toolkit</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Four tools that live where you shop.
        </h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {TOOLS.map((tool) => (
            <div key={tool.name} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">{tool.tagline}</p>
              <h3 className="mt-2 text-xl font-semibold text-slate-900">{tool.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{tool.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">Why pay?</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything they sell. Nothing to buy.
          </h2>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-semibold">Feature</th>
                  <th className="px-4 py-3 font-semibold text-[#f97316]">Influencer Butler</th>
                  <th className="px-4 py-3 font-semibold">Typical paid extensions</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{row.feature}</td>
                    <td className="px-4 py-3 font-semibold text-[#f97316]">{row.ib}</td>
                    <td className="px-4 py-3 text-slate-600">{row.others}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Based on typical pricing and feature tiers of paid Amazon influencer browser tools as
            of mid-2026.
          </p>
        </div>
      </section>

      {/* Sync explainer */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
              Better together
            </p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Your browser finds it. Your butler acts on it.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              Connect the extension with your Influencer Butler license key and everything it finds
              syncs to your dashboard: every product scan, every content gap, every storefront
              issue. Desktop app users get the same findings flowing toward the HUD, so an
              opportunity you spot while shopping becomes an action item where you work.
            </p>
            <ol className="mt-6 space-y-3 text-sm text-slate-700">
              {[
                "Install the extension and browse Amazon like normal.",
                "Paste your license key in the popup (optional, free trial keys work too).",
                "Open your dashboard and see everything your butler saw.",
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                  <span className="mt-0.5 font-semibold text-[#f97316]">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-orange-50 via-white to-white p-8 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">No desktop app yet?</h3>
            <p className="mt-2 text-sm text-slate-600">
              The extension is free either way. When you are ready to automate the rest of your
              influencer business (deal posting, Creator Connections outreach, commission
              tracking, and 42+ other butlers), the desktop app has a 3-day free trial.
            </p>
            <Link
              href="/#pricing"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-[#f97316] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
            >
              Explore the desktop app
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-slate-50 py-20">
        <div className="mx-auto max-w-4xl px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">FAQ</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Fair questions.</h2>
          <div className="mt-8 space-y-3">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <summary className="cursor-pointer list-none text-base font-semibold text-slate-900 marker:hidden">
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Stop guessing which products deserve a video.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-slate-600">
          Install the free extension and see the whole picture on every product page.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={CHROME_STORE_URL}
            className="rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
          >
            Add to Chrome - Free →
          </a>
          <Link
            href="/help"
            className="rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-800 transition hover:border-[#f97316] hover:text-[#f97316]"
          >
            Read the tutorial
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
              The all-in-one command center for creators and influencers.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <h4 className="mb-1 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">Product</h4>
            <a href="/#features" className="text-sm text-slate-500 transition hover:text-[#f97316]">Features</a>
            <a href="/#pricing" className="text-sm text-slate-500 transition hover:text-[#f97316]">Pricing</a>
            <Link href="/extension" className="text-sm text-slate-500 transition hover:text-[#f97316]">Chrome Extension - Free</Link>
            <Link href="/affiliates" className="text-sm text-slate-500 transition hover:text-[#f97316]">Affiliates - Earn 30%</Link>
          </div>
          <div className="flex flex-col gap-2.5">
            <h4 className="mb-1 text-[0.85rem] font-bold uppercase tracking-wider text-slate-900">Legal</h4>
            <a href="/legal/privacy.html" className="text-sm text-slate-500 transition hover:text-[#f97316]">Privacy Policy</a>
            <Link href="/extension/privacy" className="text-sm text-slate-500 transition hover:text-[#f97316]">Extension Privacy</Link>
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
