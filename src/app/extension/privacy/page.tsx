import Link from "next/link";
import Image from "next/image";

export const metadata = {
  title: "Extension Privacy Policy | Influencer Butler",
  description:
    "Privacy policy for the Influencer Butler Chrome extension: everything stays local in your browser unless you connect your license key, no tracking, no sale of data.",
};

const EFFECTIVE_DATE = "July 4, 2026";

const SECTIONS: Array<{ heading: string; paragraphs: string[]; bullets?: string[] }> = [
  {
    heading: "The short version",
    paragraphs: [
      "The Influencer Butler Chrome extension works entirely inside your browser. Everything it reads and everything it computes stays on your machine unless you explicitly connect your Influencer Butler license key and leave sync turned on. The extension contains no analytics, no ad trackers, and no third-party data sharing, and we never sell data. Period.",
    ],
  },
  {
    heading: "What the extension does with Amazon pages",
    paragraphs: [
      "The extension reads the content of Amazon pages you are already viewing (product pages, your order history, your storefront) to count and classify product videos, evaluate opportunity criteria, and check your storefront's health. This analysis happens locally in your browser.",
      "The only times the extension requests additional pages from Amazon are the two scans you trigger yourself with a button click (the order-history scan and the storefront checkup). Those requests use your own Amazon session, run one at a time at a human pace, and their results are processed locally like everything else. The extension never crawls Amazon in the background.",
    ],
  },
  {
    heading: "What is stored, and where",
    paragraphs: ["Stored only in your browser's local extension storage (chrome.storage.local):"],
    bullets: [
      "Your settings (commission rate, thresholds, storefront handle, tool toggles)",
      "A short-lived cache of product scan results so repeat scans are faster",
      "A queue of findings waiting to sync (only used when you connect an account)",
      "Your license key, if you choose to connect one (never placed in Chrome's synced storage, so it does not leave your machine via browser sync)",
    ],
  },
  {
    heading: "What is transmitted, and only if you opt in",
    paragraphs: [
      "If you connect your Influencer Butler license key and keep sync enabled, the extension sends your findings to influencerbutler.com over HTTPS so they appear in your dashboard. Findings are product-level data, not personal data:",
    ],
    bullets: [
      "Product scans: ASIN, marketplace, product title, price, video counts by creator type, and Butler Approved criteria results",
      "Content gaps: ASIN, title, and influencer video count for products from your own order history",
      "Storefront checkup results: the issue type and the affected video",
      "Your license key, sent only as the authorization header on those requests, only to influencerbutler.com",
    ],
  },
  {
    heading: "What is never collected",
    paragraphs: [],
    bullets: [
      "No browsing history and no tracking of the pages you visit",
      "No analytics, telemetry, fingerprinting, or advertising identifiers",
      "No reading of Amazon account credentials, payment details, or personal information from pages",
      "No data from any site other than amazon.com and influencerbutler.com",
      "No sale or sharing of data with third parties, ever",
    ],
  },
  {
    heading: "Deleting your data",
    paragraphs: [
      "Click Disconnect in the extension popup to remove your license key and clear the sync queue from your browser. Uninstalling the extension removes all local extension data. Findings already synced to your dashboard belong to your Influencer Butler account: you can review them at influencerbutler.com/dashboard/extension, and you can request deletion of your account data any time at hello@influencerbutler.com.",
    ],
  },
  {
    heading: "Permissions, explained",
    paragraphs: ["The extension requests the minimum Chrome permissions it needs:"],
    bullets: [
      "storage: save your settings, scan cache, and sync queue locally",
      "alarms: wake the background worker every couple of minutes to send queued findings when sync is on",
      "Host access to www.amazon.com: read the Amazon pages you visit and run the scans you click",
      "Host access to www.influencerbutler.com: verify your license key and sync findings to your dashboard",
    ],
  },
  {
    heading: "Changes and contact",
    paragraphs: [
      `We will update this policy if the extension's behavior changes, and material changes will be called out in the extension's release notes. Questions or deletion requests: hello@influencerbutler.com. Effective date: ${EFFECTIVE_DATE}.`,
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
