import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Extension Privacy Policy | Influencer Butler",
  description:
    "Privacy policy for the Influencer Butler Chrome extension: most work stays local in your browser, data is sent to us only if you sign in or use a hosted feature, no tracking, no sale of data.",
};

const EFFECTIVE_DATE = "October 7, 2026";

const SECTIONS: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }> = [
  {
    heading: "The short version",
    paragraphs: [
      "The Influencer Butler Chrome extension is a free toolkit for Amazon Influencers. It reads the Amazon pages you are already viewing (and, for some tools, Walmart, Target, and Benable pages) so it can show you video counts, content-gap ideas, opportunity signals, break-even math, and storefront issues, and it can build affiliate links tagged with your own Amazon Associates account. Most of its work happens locally in your browser. Data is sent to Influencer Butler only if you sign in with your license key or use one of the hosted features described below (an AI assistant, scheduled posts, saved Creator API credentials, and an optional shared product catalogue).",
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
      "Using content scripts on the Amazon storefronts it supports (amazon.com, .ca, .co.uk, .com.au, .de, .fr, .it, .es, .co.jp, .in, .com.mx, and .com.br) and the Amazon Associates program pages, the extension reads pages you are already viewing so it can compute the insights it shows you. Depending on the page, it reads:",
    ],
    bullets: [
      "Walmart, Target, and Benable pages: the product details shown on the page (for example title, price, and availability) and, on Benable, the list or product card you are looking at, so it can show price and commission signals there. It does not read your account, cart, or payment details on these sites.",
      "Deal-aggregator websites you use with the Deals tools: the product links shown on those pages, so Amazon products can be extracted from them.",
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
      "API keys and credentials for any optional providers you connect (OpenAI, Amazon Creator API, affiliate networks, link shorteners). These are encrypted on your device and are sent only to the provider they belong to. The one exception is your Amazon Creator API credentials, which, when you are signed in, are also saved to your Influencer Butler account so they work for server-side product lookups; see \"Saved Amazon Creator API credentials\" below.",
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
      "Deals you send to your dashboard from the Deals tools: product ASIN, title, price, and the source page.",
      "Campaign accepts: when the extension accepts a Creator Connections campaign for you, it reports only a count (and whether it was automatic or manual), never which campaign or brand. We also use these counts, together with similar counts for deals posted and products scanned, to show combined activity totals on our website. Those public totals are sums across all users and never identify you.",
      "Scheduled posts: if you use the \"Schedule to Social Posting Butler\" right-click action or compose box, the caption, image, and schedule you enter are saved to your account until the Influencer Butler desktop app picks them up and publishes them.",
    ],
  },
  {
    heading: "AI features we operate",
    paragraphs: [
      "When you are signed in, three features use AI providers that Influencer Butler operates (not your own key): the AI Assistant chat and voice page, the \"Influencer Butler AI\" caption writer in the schedule-a-post box, and Campaign Butler's per-campaign brief. What you type or say in the AI Assistant, and the product details or campaign signals you ask about (for example a product title, image link, page link, commission, budget, and score), are sent to our servers and from there to our AI providers: OpenAI (voice and fallback) and Groq (text). AI Assistant sessions are stored with your account email and transcript for 12 months so you can see your history and so we can support you. We do not use your data to train AI models. Please do not tell the AI Assistant passwords or payment card numbers. If you would rather not use these features, do not open them; nothing is sent unless you use them.",
    ],
  },
  {
    heading: "Saved Amazon Creator API credentials",
    paragraphs: [
      "If you enter Amazon Creator API credentials in the extension's Settings and are signed in, the extension also saves them to your Influencer Butler account so that product lookups can run on our servers. We store, per marketplace, your Credential ID, version, Associates tag, and Credential Secret. The Credential Secret is encrypted with AES-256-GCM before it reaches our database, is write-only (we never send it back to you or to any browser), and is decrypted only on our servers to request product data from Amazon on your behalf. You can remove the saved credentials at any time from Settings, or by emailing privacy@influencerbutler.com, and they are deleted when you delete your account.",
      "If Amazon has not yet unlocked the Creator API for your own account, you can optionally use a short, expiring lease of our own credentials in the meantime. To do that, the extension sends your license key to licensing.influencerbutler.com, which returns a temporary credential.",
    ],
  },
  {
    heading: "Lookups that do not need an account",
    paragraphs: [
      "Some tools download shared reference data from influencerbutler.com without you being signed in: Amazon's commission-rate schedule, and campaign information (for example whether an ASIN is in a Creator Connections or Earn on Clicks campaign, and its rate). To ask about specific products, the extension sends the ASINs of the products on the page to us. These requests carry no account identifier and we do not link them to you, but like any web request they include your IP address and browser details, which our hosting providers process.",
    ],
  },
  {
    heading: "Linking your devices (optional)",
    paragraphs: [
      "If you link two of your computers (using a code from the Influencer Butler desktop app), the extension on one can send deals, and findings when no local app is running, to the desktop app on the other through a relay on our Cloudflare Workers. The data is held only as long as needed to deliver it. Settings and secrets are never relayed. If you do not link a device, nothing is relayed.",
    ],
  },
  {
    heading: "Contributing to the shared product catalogue (optional, off by default)",
    paragraphs: [
      "Influencer Butler offers an optional shared product catalogue so creators can see real demand and price history for Amazon products, including the sales signals Amazon no longer publishes. Contributing to it is off by default. You turn it on with the \"Contribute to the shared product catalogue\" toggle, and you can turn it off again at any time.",
      "When contribution is on, and only then, the extension includes these product facts from the Amazon product pages you already view in the sync described above: ASIN, marketplace, price, best-seller rank, the \"bought in past month\" figure, category, brand, and which creator videos appear in the product's video carousel and where. These are facts about the product, not about you. We pool them, de-identified, so every Influencer Butler user can see pooled price history, rank history, video placement history, and an estimated monthly-sales figure. We keep a record of which account contributed an observation for security and abuse prevention only, and that record is never shown to other users or included in any catalogue we display or share.",
      "We never pool personal data through this feature: not your orders, not your storefront, not your earnings, not your browsing outside Amazon product pages. If contribution is off, none of the product facts above are transmitted.",
    ],
  },
  {
    heading: "Optional integrations you turn on",
    paragraphs: [
      "The extension does not contact these services unless you enter your own credentials for them in Settings. When you do, the extension sends data directly to that provider using your key, and only to that provider. Influencer Butler does not receive that data.",
    ],
    bullets: [
      "OpenAI (api.openai.com): if you connect an OpenAI key, product details are sent to OpenAI to draft a caption when you click the caption button.",
      "Amazon Creator API: if you connect Creator API credentials, the extension (and, once you are signed in and the credentials are saved to your account, our servers on your behalf) can query Amazon's product API using your credentials to enrich product data. See \"Saved Amazon Creator API credentials\" above.",
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
      "It does not use advertising trackers, fingerprinting, or advertising identifiers, and it does not send analytics or telemetry to us beyond the aggregate action counts described above (selector-health counters stay on your device).",
      "It does not read your Amazon password, payment card numbers, or the passwords to any account. (If you choose to save Amazon Creator API credentials, see the section above.)",
      "It does not sell your data. It does not share your personal data with anyone other than the parties named in this policy. If you opt in to the shared product catalogue, it contributes de-identified product facts (never personal data) as described in \"Contributing to the shared product catalogue\" above.",
    ],
  },
  {
    heading: "Parties your data may be shared with",
    paragraphs: [
      "In addition to Influencer Butler (The Social Media Posse LLC) and the optional providers you choose to connect, the only other parties involved are our own service providers that operate our dashboard, sign-in, and hosted features: Vercel (hosting for influencerbutler.com), Supabase (database and authentication, hosted in the United States), Cloudflare (edge network for links.influencerbutler.com, the licensing service, and the device relay), Lemon Squeezy (license verification), and, when you use the AI features, OpenAI and Groq. We do not sell data to anyone. If you opt in to the shared product catalogue, the de-identified product facts you contribute become part of a catalogue visible to other Influencer Butler users. No personal data is included, and contributors are never identified to other users.",
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
      "scripting: add the extension's on-page tools to the deal pages you have allowed it to run on.",
      "contextMenus: add the right-click action \"Schedule to Social Posting Butler\" for images.",
      "downloads: save a file to your computer when you ask a tool to export or save something.",
      "Host access to Amazon (the storefronts listed above and the affiliate-program.amazon.* creator pages): read the Amazon pages you visit and run the scans you click.",
      "Host access to Walmart, Target, and Benable (www.walmart.com, www.target.com and redsky.target.com, benable.com) and to a short list of deal-aggregator sites: read the product details on pages you visit there to show price and commission signals.",
      "Host access to influencerbutler.com, links.influencerbutler.com, and licensing.influencerbutler.com: verify your license key, sync findings to your dashboard, use the hosted features described above, create branded links, and run the device relay.",
      "Optional host access requested only when you use the matching feature: the provider hosts above (OpenAI, Amazon Creator API hosts, affiliate networks, link shorteners, Walmart and Mavely creator sites) and, for the deal-site harvester, the specific deal pages you provide.",
    ],
  },
  {
    heading: "Data retention and deletion",
    paragraphs: [
      "Local data stays until you clear it. Click Disconnect in the extension popup to remove your license key and clear the sync queue, and uninstalling the extension removes all of its local data from your browser. Findings already synced to your dashboard belong to your Influencer Butler account: you can review them at influencerbutler.com/dashboard/extension, and you can request deletion of your account data at any time by emailing privacy@influencerbutler.com; we delete or anonymize it within 30 days, except records we must keep for legal reasons. AI Assistant transcripts are kept for 12 months. For how long we keep other account data, see our main Privacy Policy at influencerbutler.com/legal/privacy.",
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
    <main id="main-content" className="min-h-screen bg-white text-slate-900">
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
