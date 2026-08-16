"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { trackEvent, trackMetaEvent } from "@/lib/analytics-client";
import { TierBadge } from "@/components/TierBadge";
import {
  DISCOUNT_PCT_FIRST,
  DISCOUNT_PCT_RETURNING,
  WELCOME_FIRST_CODE,
  WELCOME_RETURNING_CODE,
  type PromoTier,
} from "@/lib/promo";
import {
  PRICE_CENTS,
  TIER_NAME,
  TIER_TAGLINE,
  TIER_FEATURES,
  FREE_TIER_NAME,
  FREE_TIER_TAGLINE,
  FREE_TIER_FEATURES,
  annualSavingsPct,
  planStringFor,
  type Tier,
  type Interval,
} from "@/lib/pricing-constants";

type Props = {
  tier: PromoTier;
  affiliateCode: string | null;
  signedIn: boolean;
  initialCode: string | null;
};

const TIER_ORDER: readonly Tier[] = ["solo", "duo", "team", "agency"] as const;

function formatMoney(cents: number): string {
  return formatMoneyFromDollars(cents / 100);
}

function formatMoneyFromDollars(value: number): string {
  const opts: Intl.NumberFormatOptions = Number.isInteger(value)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$${value.toLocaleString("en-US", opts)}`;
}

function hasAuthCookie(): boolean {
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .some((entry) => /^sb-[^=]+-auth-token=/.test(entry));
}

function openCheckout(url: string): void {
  // Full-page Lemon Squeezy hosted checkout, NOT the embedded overlay. In the
  // overlay, clicking the remove (x) control on an auto-applied discount made
  // LS's checkout break out of the iframe and land the buyer on a 404, killing
  // the sale. A full-page checkout reloads LS's own page in place, so adding or
  // removing a discount is safe. Buyers return via the checkout's redirect_url
  // (/welcome) after payment.
  window.location.href = url;
}

export default function PricingCardsClient({
  tier: promoTier,
  affiliateCode,
  signedIn,
  initialCode,
}: Props) {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);
  const [errorPlan, setErrorPlan] = useState<string | null>(null);
  // Default to annual: it bills the full year up front (cash now) and annual
  // customers churn far less. The card still shows the "/month" equivalent and
  // the 14-day trial, so the sticker price stays friendly. Visitors can flip to
  // monthly with one click.
  const [billing, setBilling] = useState<Interval>("annual");
  const touchedRef = useRef(false);

  useEffect(() => {
    if (touchedRef.current) return;
    touchedRef.current = true;
    const hasCode = Boolean(initialCode && initialCode.length > 0);
    // With a code, forward the channel tag (?s=) and referrer so an affiliate's
    // per-channel click analytics still populate now that share links land here
    // instead of /dashboard/subscription (which bounced logged-out prospects to
    // sign-in). Without a code we still POST bare so the promo-tier cookie
    // (first-visit vs returning) gets written.
    const body = hasCode
      ? JSON.stringify({
          affiliateSource: initialCode,
          source: new URLSearchParams(window.location.search).get("s") ?? undefined,
          referrer: document.referrer || undefined,
        })
      : undefined;
    fetch("/api/promo/touch", {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body,
    }).catch(() => {
      // Non-fatal; the checkout APIs also write the cookies on POST.
    });
  }, [initialCode]);

  const buyingDiscount = affiliateCode
    ? null
    : {
        code: promoTier === "first" ? WELCOME_FIRST_CODE : WELCOME_RETURNING_CODE,
        pct: promoTier === "first" ? DISCOUNT_PCT_FIRST : DISCOUNT_PCT_RETURNING,
      };

  async function handleCheckout(plan: string): Promise<void> {
    setLoadingPlan(plan);
    setErrorPlan(null);
    // Funnel step: the visitor committed to a plan and we are about to open
    // checkout. Pairs with cta_trial_click / download_page_view upstream.
    trackEvent("checkout_start", { plan, billing });
    // Meta Pixel pair for lookalike seeding. Random eventID: no server-side
    // InitiateCheckout exists, but a stable shape keeps dedup possible later.
    trackMetaEvent(
      "InitiateCheckout",
      { content_name: plan, content_category: billing },
      window.crypto?.randomUUID?.(),
    );
    try {
      const codeParam = initialCode && initialCode.length > 0 ? initialCode : "";

      if (signedIn && hasAuthCookie()) {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            code: codeParam,
            affiliateSource: initialCode ?? undefined,
            // Charge the tier we actually rendered (WELCOME30 for first-timers),
            // not one the on-mount promo/touch may have already flipped.
            shownTier: promoTier,
          }),
        });
        if (response.ok) {
          const payload = (await response.json()) as { checkoutUrl?: string };
          if (payload.checkoutUrl) {
            openCheckout(payload.checkoutUrl);
            return;
          }
        } else if (response.status === 409) {
          // Already subscribed: a fresh checkout would mint a second parallel
          // subscription. Send them to the dashboard switch-plan flow instead.
          window.location.href = "/dashboard/subscription";
          return;
        } else if (response.status !== 401) {
          const detail = await response
            .json()
            .then((body: { error?: string }) => body?.error)
            .catch(() => undefined);
          console.error("Pricing checkout failed", { plan, status: response.status, error: detail });
          setErrorPlan(plan);
          return;
        }
        // 401 (stale auth cookie) or ok-but-missing-url - fall through to guest flow.
      }

      const affiliateParam =
        initialCode && initialCode.length > 0
          ? `&affiliateSource=${encodeURIComponent(initialCode)}`
          : "";
      // Same "what you see is what you pay" tier as the auth path above.
      const shownTierParam = `&shownTier=${encodeURIComponent(promoTier)}`;
      const guestUrl = `/api/checkout/guest?plan=${plan}${codeParam ? `&code=${encodeURIComponent(codeParam)}` : ""}${affiliateParam}${shownTierParam}`;
      const guestResponse = await fetch(guestUrl, { headers: { Accept: "application/json" } });
      if (guestResponse.ok) {
        const { checkoutUrl } = (await guestResponse.json()) as { checkoutUrl?: string };
        if (checkoutUrl) {
          openCheckout(checkoutUrl);
          return;
        }
      }
      // Don't blindly navigate to the guest URL on failure: a non-ok response
      // 302-redirects to /#pricing?checkout_error=..., which dumps the visitor
      // on the home page with no explanation. Surface the error instead.
      const detail = await guestResponse
        .json()
        .then((body: { error?: string }) => body?.error)
        .catch(() => undefined);
      console.error("Pricing checkout failed", { plan, status: guestResponse.status, error: detail });
      setErrorPlan(plan);
    } catch (error) {
      console.error("Pricing checkout failed", error);
      setErrorPlan(plan);
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <>
      <Script src="https://assets.lemonsqueezy.com/lemon.js" strategy="afterInteractive" />

      <FreeTierBand />

      <BillingToggle value={billing} onChange={setBilling} />

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {TIER_ORDER.map((tier) => {
          const cents = PRICE_CENTS[tier][billing];
          const plan = planStringFor(tier, billing);
          const pricePerCycle = formatMoney(cents);
          const monthlyEquivalent =
            billing === "annual" ? formatMoneyFromDollars(cents / 100 / 12) : null;
          const discountedCents = buyingDiscount
            ? Math.round(cents * (1 - buyingDiscount.pct / 100))
            : null;

          return (
            <PlanCard
              key={tier}
              featured={tier === "solo"}
              badge={tier === "solo" ? "Most popular" : undefined}
              saveBadge={
                billing === "annual" ? `Save ${annualSavingsPct(tier)}%` : undefined
              }
              name={TIER_NAME[tier]}
              desc={TIER_TAGLINE[tier]}
              priceLabel={pricePerCycle}
              periodLabel={billing === "monthly" ? "/ month" : "/ year"}
              originalPriceLabel={discountedCents !== null ? pricePerCycle : undefined}
              discountedPriceLabel={
                discountedCents !== null ? formatMoney(discountedCents) : undefined
              }
              discountTag={
                buyingDiscount
                  ? `${buyingDiscount.code} - ${buyingDiscount.pct}% off first payment`
                  : null
              }
              effectiveLabel={
                monthlyEquivalent ? `That's just ${monthlyEquivalent}/month` : undefined
              }
              trialLabel="14-day Pro trial included - cancel before day 14 to avoid charges."
              features={[...TIER_FEATURES[tier]]}
              cta="Buy Now!"
              loading={loadingPlan === plan}
              error={
                errorPlan === plan
                  ? "Checkout is temporarily unavailable. Please try again in a moment."
                  : null
              }
              onClickPrimary={() => handleCheckout(plan)}
            />
          );
        })}
      </div>
    </>
  );
}

function FreeTierBand() {
  return (
    <div className="mb-8 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-6 sm:p-8">
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="md:max-w-xl">
          <div className="flex items-center gap-3">
            <h3 className="text-xl font-semibold tracking-tight text-slate-900">
              {FREE_TIER_NAME}
            </h3>
            <span className="rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow">
              $0
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">{FREE_TIER_TAGLINE}</p>
          <p className="mt-2 text-sm font-semibold text-emerald-800">
            This is not a free trial. These tools stay free, with no account and no credit card.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {FREE_TIER_FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="mt-0.5 flex-shrink-0 text-emerald-600"
                >
                  <path
                    d="m5 12 5 5L20 7"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-shrink-0 flex-col gap-2">
          <a
            href="/extension"
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Get the free tools
          </a>
          <p className="text-center text-xs text-slate-500">No card. No expiry.</p>
        </div>
      </div>
    </div>
  );
}

type PlanCardProps = {
  featured?: boolean;
  badge?: string;
  saveBadge?: string;
  name: string;
  desc: string;
  priceLabel: string;
  periodLabel: string;
  originalPriceLabel?: string;
  discountedPriceLabel?: string;
  discountTag?: string | null;
  effectiveLabel?: string;
  trialLabel?: string;
  features: string[];
  cta: string;
  ctaHref?: string;
  onClickPrimary?: () => void;
  loading?: boolean;
  error?: string | null;
};

function PlanCard(props: PlanCardProps) {
  const {
    featured,
    badge,
    saveBadge,
    name,
    desc,
    priceLabel,
    periodLabel,
    originalPriceLabel,
    discountedPriceLabel,
    discountTag,
    effectiveLabel,
    trialLabel,
    features,
    cta,
    ctaHref,
    onClickPrimary,
    loading,
    error,
  } = props;

  const showDiscount = originalPriceLabel && discountedPriceLabel;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-sm sm:p-8 ${
        featured ? "border-[#f97316] shadow-lg ring-1 ring-[#f97316]/20" : "border-slate-200"
      }`}
    >
      {badge ? (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#f97316] px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow">
          {badge}
        </span>
      ) : null}
      {saveBadge ? (
        <span className="absolute -top-3 right-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white shadow">
          {saveBadge}
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <h3 className="text-xl font-semibold tracking-tight text-slate-900">{name}</h3>
        <TierBadge tier="pro" />
      </div>
      <p className="mt-1 text-sm text-slate-500">{desc}</p>

      <div className="mt-6">
        {showDiscount ? (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-base font-medium text-slate-400 line-through">
              {originalPriceLabel}
            </span>
            <span className="text-4xl font-bold tracking-tight text-slate-900">
              {discountedPriceLabel}
            </span>
            <span className="text-sm text-slate-500">{periodLabel}</span>
          </div>
        ) : (
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight text-slate-900">{priceLabel}</span>
            <span className="text-sm text-slate-500">{periodLabel}</span>
          </div>
        )}
        {discountTag ? (
          <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#c2410c]">
            {discountTag}
          </p>
        ) : null}
        {effectiveLabel ? (
          <p className="mt-1 text-sm font-medium text-[#f97316]">{effectiveLabel}</p>
        ) : null}
        {trialLabel ? <p className="mt-1 text-xs text-slate-500">{trialLabel}</p> : null}
      </div>

      <ul className="mt-6 flex-1 space-y-2.5">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2 text-sm text-slate-700">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="mt-0.5 flex-shrink-0 text-[#f97316]"
            >
              <path
                d="m5 12 5 5L20 7"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        {ctaHref ? (
          <a
            href={ctaHref}
            className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
              featured
                ? "border-transparent bg-[#f97316] text-white hover:bg-[#ea580c]"
                : "border-slate-300 bg-white text-slate-700 hover:border-[#f97316] hover:text-[#f97316]"
            }`}
          >
            {cta}
          </a>
        ) : (
          <button
            type="button"
            onClick={onClickPrimary}
            disabled={loading}
            className={`inline-flex w-full items-center justify-center rounded-xl border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-70 ${
              featured
                ? "border-transparent bg-[#f97316] text-white hover:bg-[#ea580c]"
                : "border-slate-300 bg-white text-slate-700 hover:border-[#f97316] hover:text-[#f97316]"
            }`}
          >
            {loading ? "Loading…" : cta}
          </button>
        )}
        {error ? (
          <p role="alert" className="mt-2 text-center text-sm font-medium text-red-600">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

type BillingToggleProps = {
  value: Interval;
  onChange: (next: Interval) => void;
};

function BillingToggle({ value, onChange }: BillingToggleProps) {
  return (
    <div className="flex items-center justify-center">
      <div
        role="tablist"
        aria-label="Billing cadence"
        className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm"
      >
        <ToggleButton
          active={value === "monthly"}
          onClick={() => onChange("monthly")}
          label="Monthly"
        />
        <ToggleButton
          active={value === "annual"}
          onClick={() => onChange("annual")}
          label="Annual"
          badge="Save 17%"
        />
      </div>
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`relative inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-[#f97316] text-white shadow-sm"
          : "text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
      {badge ? (
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
            active ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}
