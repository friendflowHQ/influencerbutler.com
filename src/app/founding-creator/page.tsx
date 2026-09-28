import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import FoundingCreatorCta from "./FoundingCreatorCta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Campaign landing page: kept out of search results on purpose. It carries a
// standing offer (3 months free), so it should be reachable only by people we
// send here (Meta lookalike ads, affiliate shares, targeted DMs), not by anyone
// searching "influencer butler free".
export const metadata = {
  title: "Founding Creator offer | Influencer Butler",
  robots: { index: false, follow: false },
};

const POINTS = [
  "Every Pro butler unlocked: Daily Commission, Deals, Messenger, and the rest.",
  "Auto-accept the right Creator Connections campaigns based on what you actually sell.",
  "Find and post deals in your niche across your platforms automatically.",
  "Keep your DMs answered so warm followers never go cold.",
];

export default async function FoundingCreatorPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  // Dark until (1) the FOUNDINGCREATOR discount exists in Lemon Squeezy and
  // (2) this flag is set - otherwise the "3 months free" promise would show
  // full price at checkout.
  if (process.env.FOUNDING_CREATOR_ENABLED !== "1") notFound();

  const ref = (await searchParams).ref ?? null;

  return (
    <main className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-white text-slate-900">
      <div className="mx-auto max-w-2xl px-6 py-16 sm:py-20">
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

        <section className="mt-10 rounded-2xl border-2 border-[#f97316]/40 bg-white p-8 shadow-sm">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#f97316] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Founding Creator offer
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            3 months of Influencer Butler Pro, free.
          </h1>
          <p className="mt-4 text-slate-600">
            You run your Amazon storefront like a business. Butler runs the busywork: brand outreach,
            campaign acceptance, deal posting, and DMs, all on autopilot. Try every Pro tool free for
            three months.
          </p>

          <ul className="mt-6 space-y-3">
            {POINTS.map((point) => (
              <li
                key={point}
                className="flex items-start gap-3 rounded-xl bg-orange-50/60 p-3 text-sm text-slate-700"
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
                <span>{point}</span>
              </li>
            ))}
          </ul>

          <FoundingCreatorCta refCode={ref} />

          <p className="mt-4 text-xs text-slate-500">
            A card is required to hold your spot, and you will not be charged during your 3 free
            months. After that it is just $39/month, and you can cancel any time from your dashboard
            before then. Limited founding spots.
          </p>
        </section>

        <p className="mt-8 text-center text-sm text-slate-500">
          Already a member?{" "}
          <Link href="/dashboard" className="font-semibold text-slate-600 underline hover:text-[#f97316]">
            Go to your dashboard
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
