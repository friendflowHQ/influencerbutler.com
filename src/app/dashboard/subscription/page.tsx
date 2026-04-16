"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CancelFunnel from "@/components/dashboard/CancelFunnel";
import LicenseKeyDisplay from "@/components/dashboard/LicenseKeyDisplay";

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
  id: string;
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
  const [hasLicenseKey, setHasLicenseKey] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [showCancelFunnel, setShowCancelFunnel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [promoCode, setPromoCode] = useState<string>("");
  const [promoCodeOpen, setPromoCodeOpen] = useState(false);

  // Prefill the promo code from ?code=X (affiliate pre-filled share links).
  useEffect(() => {
    const fromQuery = searchParams.get("code");
    if (fromQuery && fromQuery.trim().length > 0) {
      setPromoCode(fromQuery.trim().toUpperCase());
      setPromoCodeOpen(true);
    }
  }, [searchParams]);

  useEffect(() => {
    const supabase = createClient();

    const loadData = async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;

        if (!user) {
          setLoading(false);
          return;
        }

        // Fetch subscription (most recent active one)
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("id,ls_subscription_id,ls_variant_id,status,plan_name,renews_at,ends_at")
          .eq("user_id", user.id)
          .in("status", ["active", "on_trial", "past_due", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(1);

        const sub = subs && subs.length > 0 ? (subs[0] as Subscription) : null;
        setSubscription(sub);

        if (sub) {
          const { data: keys } = await supabase
            .from("license_keys")
            .select("id")
            .eq("subscription_id", sub.id)
            .limit(1);

          if (keys && keys.length > 0) {
            setHasLicenseKey(true);
          }
        }
      } catch (err) {
        console.error("Failed to load subscription data", err);
        setError("Failed to load subscription details.");
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  const handleStartCheckout = async (plan: "monthly" | "annual") => {
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
            Unlock all 20+ automation tools with a 3-day free trial. Cancel anytime.
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

        <div className="grid gap-6 md:grid-cols-2">
          <PricingCard
            name="Pro Monthly"
            price="$19.99"
            period="/month"
            features={[
              "All 20+ automation tools",
              "Unlimited brand outreach",
              "Commission harvesting",
              "Priority email support",
            ]}
            cta={checkoutLoading === "monthly" ? "Starting…" : "Start 3-day free trial"}
            disabled={checkoutLoading !== null}
            onSelect={() => handleStartCheckout("monthly")}
          />
          <PricingCard
            name="Pro Annual"
            price="$179.99"
            period="/year"
            highlight="Save 25%"
            features={[
              "Everything in Pro Monthly",
              "Priority onboarding",
              "Early access to new tools",
            ]}
            cta={checkoutLoading === "annual" ? "Starting…" : "Start 3-day free trial"}
            disabled={checkoutLoading !== null}
            featured
            onSelect={() => handleStartCheckout("annual")}
          />
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

      {hasLicenseKey ? <LicenseKeyDisplay variant="panel" /> : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
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
      className={`rounded-2xl border bg-white p-6 shadow-sm ${
        featured ? "border-[#f97316] ring-2 ring-[#f97316]/20" : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold tracking-tight">{name}</h3>
        {highlight ? (
          <span className="rounded-full bg-[#f97316]/10 px-2.5 py-1 text-xs font-semibold text-[#ea580c]">
            {highlight}
          </span>
        ) : null}
      </div>
      <div className="mt-4 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{price}</span>
        <span className="text-sm text-slate-500">{period}</span>
      </div>
      <ul className="mt-5 space-y-2 text-sm text-slate-600">
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
