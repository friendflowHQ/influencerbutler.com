import Link from "next/link";
import Image from "next/image";
import {
  EXTENSION_ALSO_IN_THE_BOX,
  EXTENSION_GROUPS,
  EXTENSION_TOOL_COUNT,
  PERF_BUDGET_MS,
  toolsInGroup,
  type ExtensionGroup,
} from "@/lib/extension-features";

// Chrome Web Store listing URL. The extension is live, so default straight to
// the listing (same id that next.config.ts treats as the single source of
// truth). NEXT_PUBLIC_CHROME_STORE_URL can override it in the Vercel env if the
// listing is ever retargeted.
const CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ||
  "https://chromewebstore.google.com/detail/influencer-butler/cnkfballfjhdijogkjjhdfmnkijcjgbc";

// Factual, sourced from extension/src/amazon/html-fetch.ts (single serialized
// fetch chain), extension/src/shared/constants.ts (FETCH_DELAY_MIN_MS 2500,
// FETCH_DELAY_MAX_MS 4000, per-run caps) and extension/src/amazon/dp-enrich.ts
// (robot-check detection arms a cooldown). Keep this in step with the code.
const NEVER_THROTTLED_COPY =
  "One polite request at a time. Every scan runs through a single serialized fetcher with a 2.5 to 4 second jittered gap, watches for Amazon's robot check and backs off, and caps each run. You never see a screen of death.";

const NEVER_THROTTLED_POINTS = [
  "Product pages are read in place: the page you are already looking at is the data source, so nothing extra is fetched to show the panel.",
  "Order, storefront, and grid scans queue through one fetcher and wait 2.5 to 4 seconds between pages, jittered so it reads like a person browsing.",
  "If Amazon serves a robot check, the run stops and automatic enrichment pauses for ten minutes instead of hammering the block.",
  "Every run has a cap (20 orders, 25 storefront videos, 40 deal pages, 200 order-history pages), so a parsing miss can never turn into an unbounded crawl.",
];

const FAST_POINTS = [
  "The panel reads the product page you already opened, so the score, video counts, and seal appear as the page hydrates.",
  "Scan results are cached for a week, so revisiting a product or re-opening a grid is instant.",
  "Nothing runs in the background: the only waits are the deliberate pauses inside a scan you clicked.",
];

const COMPARISON: Array<{ feature: string; ib: string; others: string }> = [
  { feature: "Price", ib: "Free", others: "$25-$50/mo" },
  { feature: "Butler Score with a visible breakdown", ib: "Yes", others: "Rarely" },
  { feature: "BSR, revenue estimate, and price history on the page", ib: "Yes", others: "Sometimes" },
  { feature: "Influencer vs brand vs customer video counts", ib: "Yes", others: "Sometimes" },
  { feature: "Content gaps from your order history", ib: "Yes", others: "Usually a paid tier" },
  { feature: "Creator Connections radar with fill meters and Last Call alerts", ib: "Yes", others: "Rarely" },
  { feature: "Throttle-free paced scans", ib: "Yes", others: "Often rate-limited" },
  { feature: "Deep links that open the Amazon app", ib: "Yes, free", others: "Usually a paid tier" },
  { feature: "Localized links for 12 marketplaces", ib: "Yes", others: "Rarely" },
  { feature: "Storefront untagged and dead-product checks", ib: "Yes", others: "Usually a paid tier" },
  { feature: "Syncs with a full automation suite (42+ butlers)", ib: "Yes", others: "No" },
];

// Free Chrome extension vs the desktop app. `true`/`false` render a check / x;
// a string renders as plain text. Keeps the capability split unmistakable so
// nobody expects the extension to auto-post.
const APP_VS_EXTENSION: Array<{ feature: string; ext: boolean | string; app: boolean | string }> = [
  {
    feature: "Product research while you browse (Butler Score, BSR + revenue, price history, video counts, content gaps)",
    ext: true,
    app: true,
  },
  {
    feature: "Creator Connections Campaign Radar: score chips, fill meters, Last Call watch bells",
    ext: true,
    app: false,
  },
  { feature: "One-tap campaign accept", ext: "Via the paired desktop app", app: true },
  { feature: "Creator Connections auto-outreach", ext: false, app: true },
  {
    feature: "Deep linking (free tagged link that opens the Amazon app; branded short links with a free sign-in)",
    ext: true,
    app: true,
  },
  { feature: "Localized links for 12 marketplaces (Global Maximizer)", ext: true, app: false },
  { feature: "Deal Sites Harvester (turn deal lists into deals)", ext: true, app: true },
  { feature: "Auto-post deals to Facebook, Instagram, and more", ext: false, app: true },
  { feature: "Scheduling and autopilot posting", ext: false, app: true },
  { feature: "Like Butler (auto-like storefronts)", ext: false, app: true },
  { feature: "Auto video uploads", ext: false, app: true },
  { feature: "Commission tracking dashboard", ext: "Reads your desktop earnings when paired", app: true },
  { feature: "Runs 24/7 unattended", ext: false, app: true },
  { feature: "Price", ext: "Free", app: "From $39/mo" },
];

// One table cell for the Extension vs Desktop App grid: green check for yes,
// muted x for no (both labelled for screen readers), plain text otherwise.
function CapabilityCell({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-xs font-semibold text-slate-900 sm:text-sm">{value}</span>;
  }
  return value ? (
    <span role="img" aria-label="Yes" className="text-lg font-bold text-emerald-600">
      ✓
    </span>
  ) : (
    <span role="img" aria-label="No" className="text-lg font-bold text-slate-300">
      ✗
    </span>
  );
}

const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes. Every tool in the extension works without an account and without a card. If you also use the Influencer Butler desktop app, connecting your license key syncs your findings to your dashboard, but that is optional.",
  },
  {
    q: "Does it throttle or get me blocked?",
    a: `No. ${NEVER_THROTTLED_COPY} Scans only start when you click a scan button, and the panel itself reads the page you are already on.`,
  },
  {
    q: "Does Influencer Butler give me a deep link?",
    a: "Yes: Get link builds your own tagged Amazon link for the product on screen, free, and it opens the Amazon app on a phone; branded short links with a click ledger are optional and unlock with a free sign-in.",
  },
  {
    q: "Do I need the desktop app?",
    a: "No. The extension stands on its own. The desktop app adds the automation side: posting, deal harvesting, Creator Connections outreach, one-tap campaign accept, and more, and the two are better together.",
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
    q: "Does it work on Mac?",
    a: "Yes. It is a browser extension, so the same install works the same on Mac, Windows, and Linux in Chrome, Microsoft Edge, or Brave. There is nothing separate to download. Safari uses a different extension system and is not supported yet, so on a Mac just use Chrome, Edge, or Brave.",
  },
  {
    q: "Which marketplaces are supported?",
    a: "The on-page panel runs on Amazon.com, .ca, and .co.uk, and Global Maximizer builds localized links for 12 marketplaces (US, CA, UK, AU, DE, FR, IT, ES, JP, IN, MX, BR). Additional storefronts are on the roadmap.",
  },
];

function GroupHeading({ group, index }: { group: ExtensionGroup; index: number }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div>
        <h3 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{group.name}</h3>
        <p className="mt-1 text-sm text-slate-600">{group.tagline}</p>
      </div>
    </div>
  );
}

// One group of tool cards. The two "section" groups (Never throttled, Fast)
// have no tool rows: they explain a property of the whole extension instead.
function GroupBlock({ group, index }: { group: ExtensionGroup; index: number }) {
  if (group.id === "never-throttled") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 sm:p-8">
        <GroupHeading group={group} index={index} />
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">{NEVER_THROTTLED_COPY}</p>
        <ul className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
          {NEVER_THROTTLED_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span className="mt-0.5 font-semibold text-[#f97316]">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (group.id === "fast") {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <GroupHeading group={group} index={index} />
        {PERF_BUDGET_MS !== null ? (
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-700">
            The on-page panel renders in under {PERF_BUDGET_MS} ms on a normal product page.
          </p>
        ) : null}
        <ul className="mt-4 grid gap-3 text-sm text-slate-600 md:grid-cols-3">
          {FAST_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2">
              <span className="mt-0.5 font-semibold text-[#f97316]">•</span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const tools = toolsInGroup(group.id);
  return (
    <div>
      <GroupHeading group={group} index={index} />
      <div className={`mt-6 grid gap-6 ${tools.length > 1 ? "md:grid-cols-2" : ""}`}>
        {tools.map((tool) => (
          <div key={tool.id} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#f97316]">{tool.tagline}</p>
            <h4 className="mt-2 text-xl font-semibold text-slate-900">{tool.name}</h4>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{tool.description}</p>
          </div>
        ))}
      </div>
      {group.id === "storefront" ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Also in the box</p>
          <ul className="mt-3 grid gap-3 text-sm text-slate-600 md:grid-cols-2">
            {EXTENSION_ALSO_IN_THE_BOX.map((item) => (
              <li key={item.name}>
                <span className="font-semibold text-slate-900">{item.name}</span>: {item.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Presentational body for the free Chrome extension landing page. Shared by the
 * indexable /extension page and the attributed /extension/get route (which
 * also fires the affiliate touch), so the marketing copy lives in one place.
 * Tool names and the tool count come from src/lib/extension-features.ts.
 */
export default function ExtensionLandingContent() {
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
            Product research and Creator Connections intel,{" "}
            <span className="bg-gradient-to-r from-[#f97316] to-amber-500 bg-clip-text text-transparent">
              on the Amazon pages you already browse.
            </span>
            <br className="hidden sm:block" /> Free. Never throttled.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-slate-600">
            Butler Score, BSR and revenue estimates, price history, influencer vs brand video counts,
            Campaign Radar with fill meters and Last Call alerts, deep links that open the Amazon
            app, and localized links for 12 marketplaces: {EXTENSION_TOOL_COUNT} tools, all while
            you shop like normal.
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
          <p className="mt-4 text-sm font-medium text-slate-500">
            Works on Mac and Windows: Chrome, Edge, or Brave.
          </p>

          <dl className="mt-14 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { k: "$0", v: "Every tool, no card" },
              { k: String(EXTENSION_TOOL_COUNT), v: "Tools in your browser" },
              { k: "12", v: "Marketplaces linked" },
              { k: "42+", v: "Butlers it syncs with" },
            ].map((stat) => (
              <div key={stat.v} className="rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.v}</dt>
                <dd className="mt-1 text-2xl font-bold text-slate-900">{stat.k}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Tools, grouped */}
      <section className="mx-auto max-w-6xl px-6 py-20" id="tools">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">The toolkit</p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          {EXTENSION_TOOL_COUNT} tools that live where you shop.
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
          Seven groups, in the order a creator meets them: research the product, read the campaign,
          trust the pacing, get the link, go global, keep the storefront clean.
        </p>
        <div className="mt-12 space-y-14">
          {EXTENSION_GROUPS.map((group, index) => (
            <GroupBlock key={group.id} group={group} index={index} />
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
              issue. Pair the desktop app and the panel gains Accept buttons for campaigns, your
              real earnings per product, and the app&apos;s full price and rank history, so an
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
              The extension is free either way, and the desktop app has free butlers too: Like
              Butler, Benable Like Butler, Instagram Like Butler, CC Check, Orders Butler, and Storefront Butler stay free
              forever. When you are ready to automate the rest of your influencer business (deal
              posting, Creator Connections outreach, commission tracking, and 40+ other butlers),
              start a 14-day Pro trial.
            </p>
            <p className="mt-3 text-sm font-semibold text-slate-900">
              The only full-Pro 14-day trial in the category: every butler unlocked, not a lite tier.
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

      {/* Extension vs Desktop App */}
      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Which one do I need?
        </p>
        <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
          Extension vs Desktop App
        </h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-600">
          The free extension does the research and reads the Creator Connections grid while you
          browse. The desktop app does the automation: posting, outreach, accepting, and scheduling.
          Here is exactly what each one does.
        </p>
        <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3 font-semibold">Feature</th>
                <th className="px-4 py-3 text-center font-semibold">Free Extension</th>
                <th className="px-4 py-3 text-center font-semibold text-[#f97316]">Desktop App (Pro)</th>
              </tr>
            </thead>
            <tbody>
              {APP_VS_EXTENSION.map((row) => (
                <tr key={row.feature} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-900">{row.feature}</td>
                  <td className="px-4 py-3 text-center">
                    <CapabilityCell value={row.ext} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CapabilityCell value={row.app} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 max-w-3xl text-xs text-slate-500">
          In short: use the free extension to research products and read campaigns, then add the
          desktop app when you want to automate posting, outreach, accepting, and scheduling.
          Auto-posting is a desktop-app feature and does not run from the extension.
        </p>
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
          Install the free extension and see the whole picture on every product page and every
          campaign card.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <a
            href={CHROME_STORE_URL}
            className="rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
          >
            Add to Chrome - Free →
          </a>
          <Link
            href="/help/tutorials/extension"
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
            <Link href="/contact" className="text-sm text-slate-500 transition hover:text-[#f97316]">Contact Us</Link>
            <Link href="/help/tutorials/extension" className="text-sm text-slate-500 transition hover:text-[#f97316]">Extension tutorial</Link>
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
