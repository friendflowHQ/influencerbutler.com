import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { lookupAffiliateByCode, withTimeout } from "@/lib/affiliate-lookup";
import {
  DISCOUNT_PCT_FIRST,
  DISCOUNT_PCT_RETURNING,
  WELCOME_FIRST_CODE,
  WELCOME_RETURNING_CODE,
  readPromoTier,
  type PromoTier,
} from "@/lib/promo";
import PricingCardsClient from "./PricingCardsClient";
import PricingFaq from "./PricingFaq";
import PricingFeatures from "./PricingFeatures";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing - Influencer Butler",
  description:
    "Pick your plan. All 29+ butlers included. Cancel anytime. Special discount for first-time visitors.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

type SearchParams = Promise<{ code?: string; from?: string }>;

export default async function PricingPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const cookieStore = await cookies();

  // Redirect users with an active/on_trial subscription - they shouldn't see
  // first-payment discount UI. Mirrors src/app/welcome/page.tsx auth check.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  let signedIn = false;
  if (userData.user) {
    signedIn = true;
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const status = subs && subs.length > 0 ? subs[0].status : null;
    if (status === "active" || status === "on_trial") {
      redirect("/dashboard?from=pricing");
    }
  }

  // Affiliate code via ?code=… URL param wins over the WELCOME promo.
  const rawCode = typeof params.code === "string" ? params.code.trim() : "";
  const affiliate =
    rawCode.length > 0 ? await withTimeout(lookupAffiliateByCode(rawCode), 3000, null) : null;

  const tier: PromoTier = readPromoTier(cookieStore);

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-slate-900">
            <Image
              src="/assets/influencer-butler-logo.png"
              alt="Influencer Butler"
              width={32}
              height={32}
              className="rounded"
              priority
            />
            <span className="text-sm font-semibold tracking-tight">Influencer Butler</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="#features" className="hidden text-slate-600 hover:text-[#f97316] sm:inline">
              Features
            </Link>
            <Link href="/blog" className="hidden text-slate-600 hover:text-[#f97316] sm:inline">
              Blog
            </Link>
            <Link
              href={signedIn ? "/dashboard" : "/login"}
              className="font-medium text-slate-700 hover:text-[#f97316]"
            >
              {signedIn ? "Dashboard" : "Login"}
            </Link>
          </nav>
        </div>
      </header>

      <PromoBanner tier={tier} affiliateCode={affiliate?.code ?? null} />

      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#f97316]">
            Pricing
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            Upgrade and unlock every butler
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
            All 29+ tools, unlimited messages, and priority support. Cancel anytime - no questions
            asked.
          </p>
          <div className="mt-5 flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-medium text-emerald-900">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden />
              <span>
                <strong className="font-semibold">Three butlers stay free forever:</strong>{" "}
                Like Butler, Benable Like Butler &amp; CC Check work on every account - even after
                trial expiry or cancellation.
              </span>
            </span>
          </div>
        </div>

        <div className="mt-10 sm:mt-12">
          <PricingCardsClient
            tier={tier}
            affiliateCode={affiliate?.code ?? null}
            signedIn={signedIn}
            initialCode={rawCode || null}
          />
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          By proceeding, you agree to our{" "}
          <Link href="/legal/terms" className="font-medium text-slate-700 hover:text-[#f97316]">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/legal/eula" className="font-medium text-slate-700 hover:text-[#f97316]">
            EULA
          </Link>
          .
        </p>
      </section>

      <Guarantee />

      <section id="addons" className="scroll-mt-24 mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#f97316]">
            Add-ons
          </p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Run more than one niche?
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 sm:text-base">
            Stack the Daily Deals Workspace add-on for each extra niche.
            Independent filters, schedules, queues, and tallies per workspace.
          </p>
        </div>

        <article className="mx-auto mt-8 max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="px-6 py-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">
                  Daily Deals Workspace
                </h3>
                <p className="text-sm text-slate-600">
                  One additional Amazon Daily Deals workspace per subscription.
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-slate-900">$24.99</div>
                <div className="text-xs text-slate-500">/ month</div>
              </div>
            </div>
            <p className="mt-3 text-xs italic text-slate-500">
              No promo codes or affiliate codes apply to add-ons.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/daily-deals-workspace"
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-[#f97316] hover:text-[#f97316]"
              >
                Learn more →
              </Link>
              <Link
                href="/daily-deals-workspace#buy"
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
              >
                Buy - $24.99/mo
              </Link>
            </div>
          </div>
        </article>
      </section>

      <PricingFeatures />

      <section id="faq" className="scroll-mt-24 mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Frequently asked
        </h2>
        <div className="mt-8">
          <PricingFaq />
        </div>
      </section>

      <SiteFooter />
    </main>
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
              <span className="text-sm font-semibold tracking-tight">
                Influencer Butler
              </span>
            </Link>
            <p className="mt-3 text-sm text-slate-600">
              The all-in-one command center for creators and influencers.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">
              Product
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link href="#features" className="hover:text-[#f97316]">Features</Link></li>
              <li><Link href="/pricing" className="hover:text-[#f97316]">Pricing</Link></li>
              <li><Link href="/#how-it-works" className="hover:text-[#f97316]">How It Works</Link></li>
              <li><Link href="#faq" className="hover:text-[#f97316]">FAQ</Link></li>
              <li><Link href="/affiliates" className="hover:text-[#f97316]">Affiliates - Earn 30%</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">
              Legal
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><Link href="/legal/privacy" className="hover:text-[#f97316]">Privacy Policy</Link></li>
              <li><Link href="/legal/eula" className="hover:text-[#f97316]">EULA</Link></li>
              <li><Link href="/legal/terms" className="hover:text-[#f97316]">Terms of Service</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">
              Support
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li><a href="mailto:hello@influencerbutler.com" className="hover:text-[#f97316]">Contact Us</a></li>
              <li><Link href="/dashboard" className="hover:text-[#f97316]">My Account</Link></li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} The Social Media Posse LLC. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

function PromoBanner({
  tier,
  affiliateCode,
}: {
  tier: PromoTier;
  affiliateCode: string | null;
}) {
  if (affiliateCode) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-b border-amber-200 bg-amber-50 text-amber-900"
      >
        <div className="mx-auto max-w-6xl px-4 py-3 text-center text-sm sm:px-6">
          <strong className="font-semibold">Affiliate code {affiliateCode} applied.</strong>{" "}
          <span className="text-amber-800">Discount shown at checkout. One discount per purchase.</span>
        </div>
      </div>
    );
  }

  const code = tier === "first" ? WELCOME_FIRST_CODE : WELCOME_RETURNING_CODE;
  const pct = tier === "first" ? DISCOUNT_PCT_FIRST : DISCOUNT_PCT_RETURNING;
  const headline =
    tier === "first"
      ? `Welcome - ${pct}% off your first payment today.`
      : `Welcome back - ${pct}% off your first payment.`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-[#f97316]/30 bg-[#fff7ed] text-[#9a3412]"
    >
      <div className="mx-auto max-w-6xl px-4 py-3 text-center text-sm sm:px-6">
        <strong className="font-semibold">{headline}</strong>{" "}
        <span className="text-[#7c2d12]">
          Code <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">{code}</code>{" "}
          applied automatically.
        </span>
      </div>
    </div>
  );
}

function Guarantee() {
  return (
    <section className="border-y border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center sm:flex-row sm:justify-center sm:gap-4 sm:px-6">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="text-[#f97316]"
        >
          <path
            d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
          <path
            d="m8.5 12 2.5 2.5L16 9.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="max-w-xl text-sm text-slate-700 sm:text-base">
          <strong className="font-semibold text-slate-900">3-day free trial</strong> on every paid plan.
          Cancel anytime from your dashboard - no support ticket required.
        </p>
      </div>
    </section>
  );
}
