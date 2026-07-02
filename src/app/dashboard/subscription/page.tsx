"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import CancelFunnel from "@/components/dashboard/CancelFunnel";
import LicenseKeyDisplay, { type LicenseKey } from "@/components/dashboard/LicenseKeyDisplay";
import {
  PRICE_CENTS,
  TIER_NAME,
  TIER_TAGLINE,
  TIER_FEATURES,
  annualSavingsPct,
  planStringFor,
  type Tier,
  type Interval,
} from "@/lib/pricing-constants";

const TIER_ORDER: readonly Tier[] = ["solo", "team", "agency"] as const;

function formatPrice(cents: number): string {
  const dollars = cents / 100;
  const opts: Intl.NumberFormatOptions = Number.isInteger(dollars)
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  return `$${dollars.toLocaleString("en-US", opts)}`;
}

declare global {
  interface Window {
    LemonSqueezy?: {
      Url?: {
        Open?: (url: string) => void;
      };
    };
  }
}

type Subscription = {
  id: string | null;
  ls_subscription_id: string;
  ls_variant_id: string | number | null;
  status: string;
  plan_name: string | null;
  renews_at: string | null;
  ends_at: string | null;
};

export default function SubscriptionPage() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [licenseKey, setLicenseKey] = useState<LicenseKey | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [canUpgradeToAnnual, setCanUpgradeToAnnual] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [showCancelFunnel, setShowCancelFunnel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string>("");
  const [promoCodeOpen, setPromoCodeOpen] = useState(false);
  const [billingCadence, setBillingCadence] = useState<Interval>("monthly");
  // First-touch affiliate code from ?code= - preserved across edits to the
  // promo input so the affiliate still gets aff_ref credit even if the user
  // types a better promo over it.
  const [affiliateSource, setAffiliateSource] = useState<string | null>(null);

  // Prefill the promo code from ?code=X (affiliate pre-filled share links).
  useEffect(() => {
    const fromQuery = searchParams.get("code");
    if (fromQuery && fromQuery.trim().length > 0) {
      const normalized = fromQuery.trim().toUpperCase();
      setPromoCode(normalized);
      setPromoCodeOpen(true);
      setAffiliateSource(normalized);
      const sourceParam = searchParams.get("s");
      const referrer = typeof document !== "undefined" ? document.referrer : "";
      // Persist as the ib_aff_src cookie so the checkout API can read it
      // even if the user later clears or overwrites the promo input.
      // Source + referrer feed the per-affiliate click analytics dashboard.
      fetch("/api/promo/touch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          affiliateSource: normalized,
          source: sourceParam ?? undefined,
          referrer: referrer || undefined,
        }),
      }).catch(() => {
        // Non-fatal - checkout will fall back to body param or cookie.
      });
    }
  }, [searchParams]);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Resolved server-side: a service-role read (bypasses RLS) with an
        // email -> Lemon Squeezy fallback, so an active subscriber is
        // recognized even when the subscriptions row is RLS-hidden, mapped to
        // a different user_id, or not yet written by the webhook.
        const response = await fetch("/api/me/subscription-details");

        if (response.status === 401) {
          setLoading(false);
          return;
        }

        const payload = (await response.json()) as {
          subscription?: Subscription | null;
          licenseKey?: LicenseKey | null;
          canUpgradeToAnnual?: boolean;
        };

        if (!response.ok) {
          throw new Error("Could not load subscription details");
        }

        setSubscription(payload.subscription ?? null);
        setLicenseKey(payload.licenseKey ?? null);
        setCanUpgradeToAnnual(Boolean(payload.canUpgradeToAnnual));
      } catch (err) {
        console.error("Failed to load subscription data", err);
        setError("Failed to load subscription details.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const handleStartCheckout = async (tier: Tier) => {
    const plan = planStringFor(tier, billingCadence);
    setCheckoutLoading(plan);
    setError(null);

    try {
      const codeToSend = promoCode.trim();
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan,
          code: codeToSend.length > 0 ? codeToSend : undefined,
          affiliateSource: affiliateSource ?? undefined,
        }),
      });

      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };

      if (response.status === 401) {
        throw new Error("Please log in to start your subscription.");
      }

      if (!response.ok || !payload.checkoutUrl) {
        throw new Error(payload.error || "Could not start checkout");
      }

      if (window.LemonSqueezy?.Url?.Open) {
        window.LemonSqueezy.Url.Open(payload.checkoutUrl);
      } else {
        window.location.href = payload.checkoutUrl;
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handleUpgradeToAnnual = async () => {
    if (!subscription) return;
    setUpgrading(true);
    setError(null);

    try {
      const response = await fetch("/api/subscription/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subscription.ls_subscription_id }),
      });

      const payload = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || "Could not switch to annual");
      }

      // The variant swap lands via the LS webhook; reload to pick up the new
      // plan name + renewal date once it has been persisted.
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Upgrade failed");
      setUpgrading(false);
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-4 w-96 animate-pulse rounded bg-slate-100" />
      </section>
    );
  }

  // No active subscription → show upgrade CTA
  if (!subscription) {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Start your free trial</h1>
          <p className="mt-2 text-sm text-slate-600">
            Unlock all 29+ automation tools with a 3-day free trial. Cancel anytime.
          </p>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <PromoCodeField
          value={promoCode}
          onChange={setPromoCode}
          open={promoCodeOpen}
          onToggle={() => setPromoCodeOpen((v) => !v)}
        />

        <BillingToggle value={billingCadence} onChange={setBillingCadence} />

        <div className="grid gap-6 md:grid-cols-3">
          {TIER_ORDER.map((tier) => {
            const cents = PRICE_CENTS[tier][billingCadence];
            const plan = planStringFor(tier, billingCadence);
            const isLoading = checkoutLoading === plan;
            return (
              <PricingCard
                key={tier}
                name={TIER_NAME[tier]}
                tagline={TIER_TAGLINE[tier]}
                price={formatPrice(cents)}
                period={billingCadence === "monthly" ? "/month" : "/year"}
                highlight={
                  billingCadence === "annual" ? `Save ${annualSavingsPct(tier)}%` : undefined
                }
                features={[...TIER_FEATURES[tier]]}
                cta={isLoading ? "Starting…" : "Start 3-day free trial"}
                disabled={checkoutLoading !== null}
                featured={tier === "solo"}
                onSelect={() => handleStartCheckout(tier)}
              />
            );
          })}
        </div>
      </div>
    );
  }

  // Active subscription view
  const statusBadge = getStatusBadge(subscription.status);
  const renewalDate = subscription.renews_at
    ? new Date(subscription.renews_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const endsAt = subscription.ends_at
    ? new Date(subscription.ends_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {subscription.plan_name ?? "Pro"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {renewalDate && subscription.status !== "cancelled"
                ? `Renews on ${renewalDate}`
                : endsAt && subscription.status === "cancelled"
                ? `Access ends on ${endsAt}`
                : "Manage your subscription"}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusBadge.className}`}
          >
            {statusBadge.label}
          </span>
        </div>
      </section>

      {licenseKey ? <LicenseKeyDisplay variant="panel" licenseKey={licenseKey} /> : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {canUpgradeToAnnual ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Switch to annual and save</h2>
          <p className="mt-1 text-sm text-slate-700">
            Pay yearly instead of monthly and save {annualSavingsPct("solo")}%.{" "}
            {subscription.status === "on_trial"
              ? "You won't be charged until your trial ends, then you'll be billed yearly."
              : "We'll apply a prorated credit for the rest of this month, so you only pay the difference today."}
          </p>
          <button
            type="button"
            onClick={handleUpgradeToAnnual}
            disabled={upgrading}
            className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {upgrading ? "Switching…" : "Switch to annual"}
          </button>
        </section>
      ) : null}

      {subscription.status === "active" || subscription.status === "on_trial" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Cancel subscription</h2>
          <p className="mt-1 text-sm text-slate-600">
            You&apos;ll keep access until the end of your current billing period.
          </p>
          <button
            type="button"
            onClick={() => setShowCancelFunnel(true)}
            className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
          >
            Cancel subscription
          </button>
        </section>
      ) : null}

      {showCancelFunnel ? (
        <CancelFunnel
          subscriptionId={subscription.ls_subscription_id}
          variantId={
            subscription.ls_variant_id != null
              ? String(subscription.ls_variant_id)
              : null
          }
          renewsAt={subscription.renews_at}
          onClose={() => setShowCancelFunnel(false)}
          onCancelled={() => {
            // Leave the terminal screen visible; user closes it when done, then reload.
            setTimeout(() => window.location.reload(), 1500);
          }}
          onOfferAccepted={() => {
            setTimeout(() => window.location.reload(), 1500);
          }}
        />
      ) : null}
    </div>
  );
}

type PricingCardProps = {
  name: string;
  tagline?: string;
  price: string;
  period: string;
  highlight?: string;
  features: string[];
  cta: string;
  disabled: boolean;
  featured?: boolean;
  onSelect: () => void;
};

function PricingCard({
  name,
  tagline,
  price,
  period,
  highlight,
  features,
  cta,
  disabled,
  featured,
  onSelect,
}: PricingCardProps) {
  return (
    <div
      className={`flex flex-col rounded-2xl border bg-white p-6 shadow-sm ${
        featured ? "border-[#f97316] ring-2 ring-[#f97316]/20" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
        {highlight ? (
          <span className="rounded-full bg-[#f97316]/10 px-2.5 py-1 text-xs font-semibold text-[#ea580c]">
            {highlight}
          </span>
        ) : null}
      </div>
      {tagline ? <p className="mt-1 text-xs text-slate-500">{tagline}</p> : null}
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{price}</span>
        <span className="text-sm text-slate-500">{period}</span>
      </div>
      <ul className="mt-5 flex-1 space-y-2 text-sm text-slate-600">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2">
            <svg
              className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#f97316]"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        disabled={disabled}
        onClick={onSelect}
        className={`mt-6 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition disabled:opacity-60 ${
          featured
            ? "bg-[#f97316] text-white hover:bg-[#ea580c]"
            : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
        }`}
      >
        {cta}
      </button>
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

type PromoCodeFieldProps = {
  value: string;
  onChange: (v: string) => void;
  open: boolean;
  onToggle: () => void;
};

function PromoCodeField({ value, onChange, open, onToggle }: PromoCodeFieldProps) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between text-left"
      >
        <span className="text-sm font-medium text-slate-700">
          {value ? (
            <>
              Promo code: <span className="font-mono font-semibold text-slate-900">{value}</span>
            </>
          ) : (
            "Have a promo code?"
          )}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            type="text"
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            placeholder="e.g. JOHN"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-wider text-slate-900 placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#f97316] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30"
          />
          {value ? (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Clear
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="mt-2 text-xs text-slate-500">
        {value
          ? "Your discount will be applied at checkout."
          : "Enter a creator's code for a discount on your first month."}
      </p>
    </section>
  );
}

function getStatusBadge(status: string): { label: string; className: string } {
  switch (status) {
    case "active":
      return { label: "Active", className: "bg-emerald-100 text-emerald-800" };
    case "on_trial":
      return { label: "Free Trial", className: "bg-blue-100 text-blue-800" };
    case "cancelled":
      return { label: "Cancelled", className: "bg-slate-200 text-slate-700" };
    case "past_due":
      return { label: "Past Due", className: "bg-red-100 text-red-800" };
    case "paused":
      return { label: "Paused", className: "bg-yellow-100 text-yellow-800" };
    default:
      return { label: status, className: "bg-slate-100 text-slate-700" };
  }
}
