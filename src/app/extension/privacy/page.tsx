import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Extension Privacy Policy | Influencer Butler",
  description:
    "Privacy policy for the Influencer Butler Chrome extension: everything stays local in your browser unless you connect your license key, no tracking, no sale of data.",
};

const EFFECTIVE_DATE = "July 17, 2026";

const SECTIONS: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }> = [
  {
    heading: "The short version",
    paragraphs: [
      "The Influencer Butler Chrome extension is a free toolkit for Amazon Influencers. It reads the Amazon pages you are already viewing so it can show you video counts, content-gap ideas, opportunity signals, break-even math, and storefront issues, and it can build affiliate links tagged with your own Amazon Associates account. Most of its work happens locally in your browser.",
      "The extension is published by The Social Media Posse LLC. This policy explains, in full, what the extension collects, how it uses that information, where it is stored, and every party it may be shared with. Where the extension shares data with a third party, that party is named below.",
    ],
  },
  {
    heading: "Affiliate links and monetization (please read)",
    paragraphs: [
      "Influencer Butler is an affiliate-marketing tool. When you click \"Copy my link\" on a product page, the extension builds an Amazon affiliate link so that qualifying purchases can earn a commission. That commission is yours: the link is tagged with the Amazon Associates tag or storefront handle that you entered in the extension's settings. The extension does not use its own or the developer's tag, does not substitute a different tag, and does not redirect your commissions. If you have not entered a tag, the extension returns a plain, untagged link.",
      "Affiliate links are built only when you ask for one (the \"Copy my link\" button). The extension does not silently rewrite the links already on a page while you browse. You are responsible for adding the affiliate disclosures your own audience and the FTC require (for example, #ad or #CommissionsEarned) to any content where you share these links.",
      "If you connect optional third-party link providers in Settings (Amazon Associates, Levanta, Archer, Logie, Geniuslink, URLGenius, Linktw.in, or Influencer Butler branded links), those providers may also be used to create or shorten your affiliate links. Each provider is described under \"Optional integrations you turn on\" below.",
    ],
  },
  {
    heading: "What the extension reads from Amazon pages",
    paragraphs: [
      "Using content scripts on www.amazon.com, www.amazon.ca, and www.amazon.co.uk, the extension reads pages you are already viewing so it can compute the insights it shows you. Depending on the page, it reads:",
    ],
    bullets: [
      "Product pages: ASIN, marketplace, title, price, availability, brand, category, best-seller rank, image, the \"bought in past month\" figure, and the commission rate shown in your SiteStripe bar. On product pages it also reads Amazon's own video-widget data to classify videos as influencer, brand, or customer.",
      "Your order history: when you run the order-history scan, it reads your past orders (order id, order date, product, and the price you paid) to find products you have bought that have few or no influencer videos yet.",
      "Your storefront: when you run the storefront checkup, it reads your storefront's items (content type, title, link, and tagged products) to flag untagged videos and unavailable products.",
      "Search results and Creator Hub / Creator Connections pages: product tiles, and (on creator pages) your video uploads, tagged products, storefront handle, and any brand campaign details shown to you, so it can match campaigns and surface opportunities.",
    ],
  },
  {
    heading: "How the extension fetches extra Amazon pages",
    paragraphs: [
      "Beyond the pages you open yourself, the extension loads additional Amazon pages in two situations, both using your own signed-in Amazon session:",
    ],
    bullets: [
      "Scans you click: the order-history scan and the storefront checkup fetch pages one at a time, at a human pace, when you press their button.",
      "Watchlist checks (optional, off unless you add products to a watchlist): on a periodic alarm, the background worker briefly opens the products you are watching in inactive background tabs to read their current stock, price, and video count, then closes the tab. It can show you a desktop notification when a watched item comes back in stock, drops in price, or opens a new opportunity. If you never add a watchlist item, this does not run.",
    ],
  },
  {
    heading: "What is stored, and where",
    paragraphs: [
      "Everything below is stored in your browser's local extension storage (chrome.storage.local) on your own device. Nothing is placed in Chrome's synced storage, so none of it leaves your machine through browser sync.",
    ],
    bullets: [
      "Your settings: commission rate, thresholds, storefront handle, per-country Amazon Associates tags, tool toggles, language, and deal-source list.",
      "Your Influencer Butler license key, if you connect one, and the masked email the server returns for it (for example e***@gmail.com). The raw license key is stored only on your device.",
      "API keys and credentials for any optional providers you connect (OpenAI, Amazon Product Advertising API, affiliate networks, link shorteners). These are encrypted on your device and are sent only to the provider they belong to, never to Influencer Butler.",
      "A short-lived cache of scan results and observed prices so repeat scans are faster, plus your watchlist snapshots and local counters used to detect when a page selector breaks.",
      "A queue of findings waiting to sync (product scans, content gaps, storefront issues, and order-history results), used only if you connect an account and leave sync on.",
    ],
  },
  {
    heading: "What is transmitted to Influencer Butler, and when",
    paragraphs: [
      "If you sign in with your Influencer Butler license key, the extension syncs your findings to influencerbutler.com over HTTPS so they appear in your dashboard. Sync is on by default once you sign in; you can turn it off at any time with the sync toggle, and nothing is sent to Influencer Butler if you never sign in. Your license key is sent only as the authorization header on these requests, only to influencerbutler.com. The data synced is:",
    ],
    bullets: [
      "Product scans: ASIN, marketplace, title, price, video counts by creator type, and opportunity-criteria results.",
      "Content gaps: ASIN, title, order date, and influencer video count for products from your own order history.",
      "Order-history results: order id, order date, product ASIN and title, and the price you paid, for the orders you scan.",
      "Storefront checkup results: the storefront URL, the issue type, and the affected item.",
      "Feedback you submit through the extension: your message, the page you were on, the extension version, and browser type (your license key is attached only if you are signed in).",
    ],
  },
  {
    heading: "Optional integrations you turn on",
    paragraphs: [
      "The extension does not contact these services unless you enter your own credentials for them in Settings. When you do, the extension sends data directly to that provider using your key, and only to that provider. Influencer Butler does not receive that data.",
    ],
    bullets: [
      "OpenAI (api.openai.com): if you connect an OpenAI key, product details are sent to OpenAI to draft a caption when you click the caption button.",
      "Amazon Product Advertising API: if you connect PA-API keys, the extension can query Amazon's product API using your keys to enrich product data.",
      "Affiliate networks and link shorteners (Levanta, Archer, Logie, Geniuslink, URLGenius, Linktw.in): if you connect one, your affiliate link is created or shortened through that provider.",
      "Influencer Butler branded links (links.influencerbutler.com): if enabled, your affiliate link is shortened into a links.influencerbutler.com link with click analytics, authenticated with your signed-in license key.",
      "Deal-site harvester: if you use it, the extension fetches the deal-aggregator web pages whose URLs you provide (without sending your cookies) to extract product ASINs.",
      "Influencer Butler desktop app: if you have the desktop app running and paired, findings can be sent to it over a local connection on your own machine (they do not leave your device).",
    ],
  },
  {
    heading: "What the extension never does",
    paragraphs: [],
    bullets: [
      "It does not track your general browsing history or the sites you visit outside the hosts listed in this policy.",
      "It does not use advertising trackers, fingerprinting, or advertising identifiers, and it does not send analytics or telemetry to us (selector-health counters stay on your device).",
      "It does not read your Amazon password, payment card numbers, or other account credentials.",
      "It does not sell your data, and it does not share your data with anyone other than the parties named in this policy.",
    ],
  },
  {
    heading: "Parties your data may be shared with",
    paragraphs: [
      "In addition to Influencer Butler (The Social Media Posse LLC) and the optional providers you choose to connect, the only other parties involved are our own service providers that operate our dashboard and sign-in: Cloudflare (hosting and edge network for influencerbutler.com and links.influencerbutler.com) and Lemon Squeezy (license verification). We do not sell data to anyone.",
    ],
  },
  {
    heading: "Permissions, explained",
    paragraphs: ["Here is every permission the extension requests and why:"],
    bullets: [
      "storage: save your settings, encrypted provider keys, scan cache, watchlist, and sync queue locally.",
      "alarms: wake the background worker on a schedule to flush queued findings when sync is on, refresh catalog data, and run watchlist checks you have enabled.",
      "notifications: show the optional watchlist and getting-started notifications described above. None fire unless you opt in.",
      "tabs: briefly open an Amazon product page in an inactive background tab so its video widget can load during a scan or watchlist check, then close it.",
      "Host access to Amazon (www.amazon.com, .ca, .co.uk, and the affiliate-program.amazon.* creator pages): read the Amazon pages you visit and run the scans you click.",
      "Host access to influencerbutler.com and links.influencerbutler.com: verify your license key, sync findings to your dashboard, and create branded links.",
      "Optional host access requested only when you use the matching feature: the provider hosts above (OpenAI, Amazon PA-API marketplaces, affiliate networks, link shorteners) and, for the deal-site harvester, the specific deal pages you provide.",
    ],
  },
  {
    heading: "Data retention and deletion",
    paragraphs: [
      "Local data stays until you clear it. Click Disconnect in the extension popup to remove your license key and clear the sync queue, and uninstalling the extension removes all of its local data from your browser. Findings already synced to your dashboard belong to your Influencer Butler account: you can review them at influencerbutler.com/dashboard/extension, and you can request deletion of your account data at any time by emailing privacy@influencerbutler.com.",
    ],
  },
  {
    heading: "Changes and contact",
    paragraphs: [
      `We will update this policy whenever the extension's behavior changes, and material changes will be called out in the extension's release notes. Questions: hello@influencerbutler.com. Data and deletion requests: privacy@influencerbutler.com. The Social Media Posse LLC, 3556 S 5600 W #1-478, Salt Lake City, UT 84120. Effective date: ${EFFECTIVE_DATE}.`,
    ],
  },
];

export default function ExtensionPrivacyPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
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
          <Link
            href="/extension"
            className="rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            About the extension
          </Link>
        </div>
      </header>

      <article className="mx-auto max-w-4xl px-6 py-14">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Chrome Extension
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-slate-500">Effective {EFFECTIVE_DATE}</p>

        <div className="mt-8 space-y-8">
          {SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-slate-900">{section.heading}</h2>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 40)} className="mt-2 text-sm leading-relaxed text-slate-600">
                  {paragraph}
                </p>
              ))}
              {section.bullets ? (
                <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
                  {section.bullets.map((bullet) => (
                    <li key={bullet.slice(0, 40)}>{bullet}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>

        <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-sm text-slate-600">
          This policy covers the Chrome extension specifically. The website and desktop app are
          covered by the{" "}
          <a href="/legal/privacy.html" className="font-medium text-[#f97316] hover:text-[#ea580c]">
            Influencer Butler Privacy Policy
          </a>
          .
        </div>
      </article>

      <footer className="border-t border-slate-200 bg-[#fafafa] py-8">
        <p className="text-center text-xs text-slate-500">
          © {new Date().getFullYear()} The Social Media Posse LLC. All rights reserved.
        </p>
      </footer>
    </main>
  );
}
