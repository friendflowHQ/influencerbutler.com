import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { DAILY_DEALS_ADDON_PRICE_USD } from "@/lib/pricing-constants";
import BuyAddonButton from "./BuyAddonButton";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Daily Deals Workspace Add-on - $24.99/mo · Influencer Butler",
  description:
    "Add a second Daily Deals Butler workspace for a different niche. Own filters, schedules, and queues - managed alongside your main workspace. No promo or affiliate codes apply.",
  openGraph: {
    title: "Daily Deals Workspace Add-on - $24.99/mo",
    description:
      "Add a second Daily Deals Butler workspace for a different niche.",
    type: "website",
  },
};

export default async function DailyDealsWorkspacePage() {
  // Detect sign-in for the header CTA + the BuyAddonButton routing
  // (auth flow vs. guest flow). The add-on doesn't require auth - guest
  // purchases work fine - but signed-in customers get their existing
  // licence credited automatically.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const signedIn = !!userData.user;

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
            <Link href="/pricing" className="hidden text-slate-600 hover:text-[#f97316] sm:inline">
              Pricing
            </Link>
            <Link href="/#features" className="hidden text-slate-600 hover:text-[#f97316] sm:inline">
              Features
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

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-[#f97316]">
            Add-on
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
            One Daily Deals Butler per niche
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base text-slate-600 sm:text-lg">
            Run a separate Daily Deals Butler workspace for each niche you
            promote - Gardening, Sports, Cooking, whatever. Own filters,
            schedules, post queues, and tallies. Stacks cleanly with your
            Pro plan, no extra setup.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <BuyAddonButton signedIn={signedIn} />
            <p className="text-xs text-slate-500">
              ${DAILY_DEALS_ADDON_PRICE_USD.toFixed(2)}/month per extra workspace · No promo or affiliate codes apply
            </p>
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Who this is for
          </h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="text-3xl">🪴</div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                Multi-niche creators
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                You post Gardening deals on one storefront and Sports deals on
                another. One Daily Deals Butler doesn&apos;t cut it because the
                filters, schedules, and post queues need to be different per
                niche.
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="text-3xl">📅</div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                Different posting cadences
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Your Cooking workspace posts at 10am ET. Your Sports workspace
                fires every game-day Saturday. Independent schedulers per
                clone - they don&apos;t step on each other.
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="text-3xl">📊</div>
              <h3 className="mt-3 text-base font-semibold text-slate-900">
                Track each niche separately
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                Per-workspace tallies and earnings rollups so you can see which
                niche is actually paying off. No more averaging everything into
                one number that hides the real winner.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          How it works
        </h2>
        <ol className="mt-10 space-y-6 sm:space-y-8">
          <li className="flex gap-4">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f97316] text-sm font-bold text-white">
              1
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">Buy the add-on</h3>
              <p className="mt-1 text-sm text-slate-600">
                Subscribe to Daily Deals Workspace for $24.99/month. You get
                one new workspace per subscription - buy more anytime you need
                another niche.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f97316] text-sm font-bold text-white">
              2
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Open Influencer Butler
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Next time you sign in, the new workspace is already credited.
                Open Daily Deals Butler in the nav and click{" "}
                <span className="font-mono text-[13px]">+ Add Workspace</span>.
                Name it whatever you want - &ldquo;Gardening&rdquo;,
                &ldquo;Sports&rdquo;, &ldquo;Cooking&rdquo;.
              </p>
            </div>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#f97316] text-sm font-bold text-white">
              3
            </span>
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Configure it like a brand-new workspace
              </h3>
              <p className="mt-1 text-sm text-slate-600">
                Optionally clone your existing filters / presets / schedules
                with one click (fresh queues + tallies), or start from the
                Daily Deals Butler defaults. Your existing workspace stays
                untouched.
              </p>
            </div>
          </li>
        </ol>
      </section>

      {/* Pricing card */}
      <section className="bg-white py-12 sm:py-16">
        <div className="mx-auto max-w-2xl px-4 sm:px-6">
          <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="bg-slate-900 px-6 py-4 text-white">
              <h3 className="text-lg font-semibold">Daily Deals Workspace</h3>
              <p className="text-sm text-slate-300">
                One extra Daily Deals Butler workspace per subscription
              </p>
            </div>
            <div className="px-6 py-8 sm:px-10">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold tracking-tight text-slate-900">
                  ${DAILY_DEALS_ADDON_PRICE_USD.toFixed(2)}
                </span>
                <span className="text-sm text-slate-500">/month</span>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Fixed price. No promo codes, no affiliate codes. Cancel
                anytime; the workspace stays in read-only until you renew.
              </p>

              <ul className="mt-6 space-y-2 text-sm text-slate-700">
                <li className="flex gap-2">
                  <span className="text-[#f97316]" aria-hidden>
                    ✓
                  </span>
                  One additional Daily Deals Butler workspace
                </li>
                <li className="flex gap-2">
                  <span className="text-[#f97316]" aria-hidden>
                    ✓
                  </span>
                  Own filters, schedules, post queues, and earnings tallies
                </li>
                <li className="flex gap-2">
                  <span className="text-[#f97316]" aria-hidden>
                    ✓
                  </span>
                  Stackable - buy as many add-ons as you have niches
                </li>
                <li className="flex gap-2">
                  <span className="text-[#f97316]" aria-hidden>
                    ✓
                  </span>
                  Activates automatically the next time you sign in
                </li>
                <li className="flex gap-2">
                  <span className="text-[#f97316]" aria-hidden>
                    ✓
                  </span>
                  Requires an active Pro Solo / Team / Agency subscription
                </li>
              </ul>

              <div className="mt-8 flex flex-col gap-3">
                <BuyAddonButton
                  signedIn={signedIn}
                  className="inline-flex w-full items-center justify-center rounded-lg bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] disabled:cursor-progress disabled:opacity-70"
                />
                <p className="text-center text-xs text-slate-500">
                  Don&apos;t have Influencer Butler yet?{" "}
                  <Link href="/pricing" className="font-semibold text-slate-700 hover:text-[#f97316]">
                    Start with Pro
                  </Link>{" "}
                  first.
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-center text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Frequently asked
        </h2>
        <dl className="mt-10 space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <dt className="text-base font-semibold text-slate-900">
              Do I need an active Pro subscription?
            </dt>
            <dd className="mt-2 text-sm text-slate-600">
              Yes. The Daily Deals Workspace add-on layers on top of your Pro
              Solo / Team / Agency subscription. If your Pro subscription
              lapses, the add-on workspace goes read-only (data is preserved)
              until you reactivate Pro.
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <dt className="text-base font-semibold text-slate-900">
              Can I get a discount on this add-on?
            </dt>
            <dd className="mt-2 text-sm text-slate-600">
              No - and this is enforced at three different layers in our
              checkout pipeline. Promo codes and affiliate codes apply to the
              Pro subscription only.
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <dt className="text-base font-semibold text-slate-900">
              What happens to my data if I cancel?
            </dt>
            <dd className="mt-2 text-sm text-slate-600">
              The cloned workspace stays in the app in read-only mode. You can
              still view filters, queues, and tallies; you just can&apos;t run
              the harvester or publish until you renew. Re-subscribing
              reactivates the workspace exactly where you left off.
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <dt className="text-base font-semibold text-slate-900">
              How do I reactivate a locked workspace?
            </dt>
            <dd className="mt-2 text-sm text-slate-600">
              When an add-on lapses, that workspace shows a lock notice inside
              the app. You have two ways back in. Renew the subscription and the
              workspace unlocks automatically the next time you sign in. Or, if
              you already have an active add-on key, paste it right on the lock
              screen and click Validate &amp; unlock to restore the workspace on
              the spot. The lock screen also links straight to Manage
              subscription so you can renew without leaving the app.
            </dd>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <dt className="text-base font-semibold text-slate-900">
              Can I buy more than one?
            </dt>
            <dd className="mt-2 text-sm text-slate-600">
              Absolutely. Each $24.99/month subscription unlocks exactly one
              extra workspace. If you have four niches, buy four. They show up
              as separate Butlers under Daily Deals Butler in the nav.
            </dd>
          </div>
        </dl>
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
              The all-in-one command center for Amazon Influencers.
            </p>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">
              Product
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>
                <Link href="/" className="hover:text-[#f97316]">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="hover:text-[#f97316]">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/daily-deals-workspace" className="hover:text-[#f97316]">
                  Add-ons
                </Link>
              </li>
              <li>
                <Link href="/affiliates" className="hover:text-[#f97316]">
                  Affiliates - Earn 30%
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">
              Legal
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>
                <Link href="/legal/privacy" className="hover:text-[#f97316]">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/eula" className="hover:text-[#f97316]">
                  EULA
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="hover:text-[#f97316]">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-slate-900">
              Company
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              <li>
                <Link href="/login" className="hover:text-[#f97316]">
                  Sign in
                </Link>
              </li>
              <li>
                <Link href="/signup" className="hover:text-[#f97316]">
                  Create account
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
