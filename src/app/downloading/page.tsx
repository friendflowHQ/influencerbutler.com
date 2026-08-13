import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import {
  WINDOWS_DOWNLOAD_URL,
  currentMacDownloadUrl,
} from "@/lib/desktop-downloads";
import DownloadStarter from "./DownloadStarter";
import DownloadEmailCapture from "./DownloadEmailCapture";
import NoCardTrialCta from "./NoCardTrialCta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Transient handoff page, not a landing page: keep it out of search results.
export const metadata = {
  title: "Your download is starting | Influencer Butler",
  robots: { index: false, follow: false },
};

// Chrome Web Store listing. Mirrors the /extension short link so this page can
// deep-link the install without depending on the redirect (and stays overridable
// via the same env var used on the extension landing page).
const CHROME_STORE_URL =
  process.env.NEXT_PUBLIC_CHROME_STORE_URL ||
  "https://chromewebstore.google.com/detail/influencer-butler/cnkfballfjhdijogkjjhdfmnkijcjgbc";

const OS_LABELS: Record<string, string> = {
  win: "Windows",
  "mac-arm": "Mac (Apple Silicon)",
  "mac-intel": "Mac (Intel)",
};

// Four one-line reasons to add the extension now, condensed from the extension
// landing page's toolkit so the pitch stays consistent.
const EXTENSION_POINTS = [
  "See influencer vs brand vs customer video counts on any product page.",
  "Find content gaps in products you already ordered.",
  "Spot Butler Approved opportunities with the criteria shown.",
  "Run a one-click storefront checkup for missing or dead tags.",
];

async function resolveDownloadUrl(os: string): Promise<string | null> {
  switch (os) {
    case "win":
      return WINDOWS_DOWNLOAD_URL;
    case "mac-arm":
      return currentMacDownloadUrl("arm64");
    case "mac-intel":
      return currentMacDownloadUrl("x64");
    default:
      return null;
  }
}

/**
 * Download handoff interstitial. /api/trial/start (the tracked /go/download
 * redirect) sends visitors here with ?os= instead of straight to the installer,
 * so that every desktop download gets one screen that (1) auto-starts the
 * installer and (2) pushes the free Chrome extension as the immediate next
 * step. An unknown/missing os falls back to the /download chooser page.
 */
export default async function DownloadingPage({
  searchParams,
}: {
  searchParams: Promise<{ os?: string }>;
}) {
  const os = (await searchParams).os ?? "";
  const downloadUrl = await resolveDownloadUrl(os);
  if (!downloadUrl) redirect("/download");

  const osLabel = OS_LABELS[os] ?? "your device";

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-white text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
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

        {/* Step 1: the download that is already happening */}
        <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#f97316]/30 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
            Step 1 of 2
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            Your {osLabel} download is starting.
          </h1>
          <p className="mt-4 text-slate-600">
            Check your browser&apos;s downloads bar, then open the installer to finish setting up
            the desktop app.
          </p>
          <DownloadStarter url={downloadUrl} />
          <DownloadEmailCapture />
          {process.env.NO_CARD_TRIAL_ENABLED === "1" ? <NoCardTrialCta /> : null}
        </section>

        {/* Step 2: add the free extension while the app installs */}
        <section className="mt-6 rounded-2xl border-2 border-[#f97316]/40 bg-white p-8 shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f97316] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Step 2 of 2: don&apos;t skip this
          </span>
          <h2 className="mt-5 text-2xl font-bold tracking-tight sm:text-3xl">
            While that installs, add the free Chrome extension.
          </h2>
          <p className="mt-4 text-slate-600">
            The desktop app automates your posting and outreach. The free extension is the other
            half: the Amazon intel you need while you browse. Add it now so it is ready when the app
            finishes installing.
          </p>
          <ul className="mt-6 space-y-3">
            {EXTENSION_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 rounded-xl bg-orange-50/60 p-3 text-sm text-slate-700">
                <CheckIcon />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <a
            href={CHROME_STORE_URL}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
          >
            Add to Chrome - it&apos;s free →
          </a>
          <p className="mt-3 text-xs text-slate-500">
            Works in Chrome, Edge, or Brave on Mac and Windows. No account, no card.
          </p>
        </section>

        <p className="mt-8 text-center text-sm text-slate-500">
          Prefer to install the extension later?{" "}
          <Link href="/help/tutorials/extension" className="font-semibold text-slate-600 underline hover:text-[#f97316]">
            Read the setup tutorial
          </Link>
          .
        </p>
      </div>
    </main>
  );
}

function CheckIcon() {
  return (
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
  );
}
