"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import {
  DISCOUNT_PCT_FIRST,
  DISCOUNT_PCT_RETURNING,
  WELCOME_FIRST_CODE,
  WELCOME_RETURNING_CODE,
  type PromoTier,
} from "@/lib/promo";

type Prices = { monthly: number; annual: number };

type Props = {
  tier: PromoTier;
  affiliateCode: string | null;
  prices: Prices;
  signedIn: boolean;
  initialCode: string | null;
};

type LemonSqueezyWindow = Window & {
  LemonSqueezy?: { Url?: { Open?: (url: string) => void } };
};

const FEATURES_FREE = [
  "Full Pro access for 3 days",
  "Unlimited CC Brand Messages",
  "Unlimited Instagram DMs",
  "All 29+ tools unlocked",
  "Cancel anytime before day 3",
];

const FEATURES_MONTHLY = [
  "Unlimited CC Brand Messages",
  "Unlimited Instagram DMs",
  "Unlimited Automation Actions",
  "All 29+ tools unlocked",
  "Deep link & affiliate integrations",
  "Analytics dashboard",
  "Priority support",
];

const FEATURES_ANNUAL = [
  "Everything in Monthly",
  "Priority feature requests",
  "Early access to new butlers",
  "Dedicated support",
];

function formatMoney(value: number): string {
  if (Number.isInteger(value)) return `$${value}`;
  return `$${value.toFixed(2)}`;
}

function hasAuthCookie(): boolean {
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .some((entry) => /^sb-[^=]+-auth-token=/.test(entry));
}

function withEmbedParam(url: string): string {
  try {
    const u = new URL(url);
    u.searchParams.set("embed", "1");
    return u.toString();
  } catch {
    return url + (url.includes("?") ? "&" : "?") + "embed=1";
  }
}

function openCheckout(url: string): void {
  const w = window as LemonSqueezyWindow;
  if (w.LemonSqueezy?.Url?.Open) {
    w.LemonSqueezy.Url.Open(withEmbedParam(url));
  } else {
    window.location.href = url;
  }
}

export default function PricingCardsClient({
  tier,
  affiliateCode,
  prices,
  signedIn,
  initialCode,
}: Props) {
  const [loadingPlan, setLoadingPlan] = useState<"monthly" | "annual" | null>(null);
  const touchedRef = useRef(false);

  // On mount, persist the visitor + promo cookies so server-side reads on the
  // next request are consistent with what we rendered.
  useEffect(() => {
    if (touchedRef.current) return;
    touchedRef.current = true;
    fetch("/api/promo/touch", { method: "POST" }).catch(() => {
      // Non-fatal; the checkout APIs also write the cookies on POST.
    });
  }, []);

  const buyingDiscount = affiliateCode
    ? null
    : { code: tier === "first" ? WELCOME_FIRST_CODE : WELCOME_RETURNING_CODE, pct: tier === "first" ? DISCOUNT_PCT_FIRST : DISCOUNT_PCT_RETURNING };

  const monthlyAfter = buyingDiscount
    ? prices.monthly * (1 - buyingDiscount.pct / 100)
    : null;
  const annualAfter = buyingDiscount ? prices.annual * (1 - buyingDiscount.pct / 100) : null;

  async function handleCheckout(plan: "monthly" | "annual"): Promise<void> {
    setLoadingPlan(plan);
    try {
      const codeParam = initialCode && initialCode.length > 0 ? initialCode : "";

      if (signedIn && hasAuthCookie()) {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, code: codeParam }),
        });
        if (response.status !== 401 && response.ok) {
          const payload = (await response.json()) as { checkoutUrl?: string };
          if (payload.checkoutUrl) {
            openCheckout(payload.checkoutUrl);
            return;
          }
        }
        // 401 or missing url — fall through to guest flow.
      }

      const guestUrl = `/api/checkout/guest?plan=${plan}${codeParam ? `&code=${encodeURIComponent(codeParam)}` : ""}`;
      const guestResponse = await fetch(guestUrl, { headers: { Accept: "application/json" } });
      if (guestResponse.ok) {
        const { checkoutUrl } = (await guestResponse.json()) as { checkoutUrl?: string };
        if (checkoutUrl) {
          openCheckout(checkoutUrl);
          return;
        }
      }
      // Hard fallback: navigate to the guest endpoint which 302s to LS.
      window.location.href = guestUrl;
    } catch (error) {
      console.error("Pricing checkout failed", error);
      const codeParam = initialCode && initialCode.length > 0 ? initialCode : "";
      window.location.href = `/api/checkout/guest?plan=${plan}${codeParam ? `&code=${encodeURIComponent(codeParam)}` : ""}`;
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <>
      <Script src="https://assets.lemonsqueezy.com/lemon.js" strategy="afterInteractive" />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <PlanCard
          name="Free trial"
          desc="Full Pro access, $0 for 3 days"
          priceLabel="$0"
          periodLabel="/ 3 days"
          trialLabel={`Then ${formatMoney(monthlyAfter ?? prices.monthly)}/month — cancel anytime`}
          discountTag={
            buyingDiscount ? `${buyingDiscount.code} — ${buyingDiscount.pct}% off first payment` : null
          }
          features={FEATURES_FREE}
          cta="Start free trial"
          loading={loadingPlan === "monthly"}
          onClickPrimary={() => handleCheckout("monthly")}
        />

        <PlanCard
          featured
          badge="Most popular"
          name="Pro Monthly"
          desc="Full power, flexible billing"
          priceLabel={formatMoney(prices.monthly)}
          periodLabel="/ month"
          originalPriceLabel={monthlyAfter !== null ? formatMoney(prices.monthly) : undefined}
          discountedPriceLabel={monthlyAfter !== null ? formatMoney(monthlyAfter) : undefined}
          discountTag={
            buyingDiscount ? `${buyingDiscount.code} — ${buyingDiscount.pct}% off first payment` : null
          }
          features={FEATURES_MONTHLY}
          cta="Start free trial"
          loading={loadingPlan === "monthly"}
          onClickPrimary={() => handleCheckout("monthly")}
        />

        <PlanCard
          name="Pro Annual"
          desc="Best value — save 25% vs monthly"
          priceLabel={formatMoney(prices.annual)}
          periodLabel="/ year"
          originalPriceLabel={annualAfter !== null ? formatMoney(prices.annual) : undefined}
          discountedPriceLabel={annualAfter !== null ? formatMoney(annualAfter) : undefined}
          discountTag={
            buyingDiscount ? `${buyingDiscount.code} — ${buyingDiscount.pct}% off first payment` : null
          }
          saveBadge="Save 25%"
          effectiveLabel={`That's just ${formatMoney((annualAfter ?? prices.annual) / 12)}/month`}
          features={FEATURES_ANNUAL}
          cta="Start free trial"
          loading={loadingPlan === "annual"}
          onClickPrimary={() => handleCheckout("annual")}
        />
      </div>
    </>
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

      <h3 className="text-xl font-semibold tracking-tight text-slate-900">{name}</h3>
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
      </div>
    </div>
  );
}
