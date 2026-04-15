"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
  status: string;
  plan_name: string | null;
  renews_at: string | null;
  ends_at: string | null;
};

type LicenseKey = {
  id: string;
  key: string;
  status: string;
  activation_limit: number | null;
  activations_count: number | null;
};

const MONTHLY_VARIANT_ID = process.env.NEXT_PUBLIC_LEMONSQUEEZY_MONTHLY_VARIANT_ID || "";
const ANNUAL_VARIANT_ID = process.env.NEXT_PUBLIC_LEMONSQUEEZY_ANNUAL_VARIANT_ID || "";

export default function SubscriptionPage() {
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [licenseKey, setLicenseKey] = useState<LicenseKey | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [copied, setCopied] = useState(false);
  const [keyRevealed, setKeyRevealed] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

        setUserEmail(user.email ?? null);
        setUserId(user.id);

        // Fetch subscription (most recent active one)
        const { data: subs } = await supabase
          .from("subscriptions")
          .select("id,ls_subscription_id,status,plan_name,renews_at,ends_at")
          .eq("user_id", user.id)
          .in("status", ["active", "on_trial", "past_due", "cancelled"])
          .order("created_at", { ascending: false })
          .limit(1);

        const sub = subs && subs.length > 0 ? (subs[0] as Subscription) : null;
        setSubscription(sub);

        if (sub) {
          const { data: keys } = await supabase
            .from("license_keys")
            .select("id,key,status,activation_limit,activations_count")
            .eq("subscription_id", sub.id)
            .limit(1);

          if (keys && keys.length > 0) {
            setLicenseKey(keys[0] as LicenseKey);
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

  const handleStartCheckout = async (variantId: string, plan: string) => {
    if (!userId || !userEmail) {
      setError("Please log in to start your subscription.");
      return;
    }

    setCheckoutLoading(plan);
    setError(null);

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variantId, email: userEmail, userId }),
      });

      const payload = (await response.json()) as { checkoutUrl?: string; error?: string };

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

  const handleCancelSubscription = async () => {
    if (!subscription) return;
    setCancelLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/subscription/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subscription.ls_subscription_id }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error || "Could not cancel subscription");
      }

      // Refresh the page to show updated status
      window.location.reload();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Cancellation failed");
      setCancelLoading(false);
      setShowCancelConfirm(false);
    }
  };

  const handleCopyKey = async () => {
    if (!licenseKey) return;
    try {
      await navigator.clipboard.writeText(licenseKey.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Failed to copy to clipboard");
    }
  };

  if (loading) {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="h-8 w-64 animate-pulse rounded bg-slate-100" />
        <div className="mt-4 h-4 w-96 animate-pulse rounded bg-slate-100" />
      </section>
    );
  }

  // No active subscription → show upgrade CTA
  if (!subscription) {
    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-semibold tracking-tight">Start your free trial</h1>
          <p className="mt-2 text-sm text-slate-600">
            Unlock all 20+ automation tools with a 7-day free trial. Cancel anytime.
          </p>
        </section>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

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
            cta={checkoutLoading === "monthly" ? "Starting…" : "Start 7-day free trial"}
            disabled={checkoutLoading !== null}
            onSelect={() => handleStartCheckout(MONTHLY_VARIANT_ID, "monthly")}
          />
          <PricingCard
            name="Pro Annual"
            price="$179.99"
            period="/year"
            highlight="Save 25%"
            features={[
              "Everything in Pro Monthly",
              "2 months free",
              "Priority onboarding",
              "Early access to new tools",
            ]}
            cta={checkoutLoading === "annual" ? "Starting…" : "Start 7-day free trial"}
            disabled={checkoutLoading !== null}
            featured
            onSelect={() => handleStartCheckout(ANNUAL_VARIANT_ID, "annual")}
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

  const maskedKey = licenseKey?.key
    ? `${licenseKey.key.slice(0, 8)}${"•".repeat(Math.max(0, licenseKey.key.length - 8))}`
    : null;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
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

      {licenseKey ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">License key</h2>
          <p className="mt-1 text-sm text-slate-600">
            Use this key to activate the Influencer Butler desktop app.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="flex-1 min-w-0 break-all rounded-lg bg-slate-50 px-4 py-3 font-mono text-sm text-slate-900">
              {keyRevealed ? licenseKey.key : maskedKey}
            </code>
            <button
              type="button"
              onClick={() => setKeyRevealed((prev) => !prev)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {keyRevealed ? "Hide" : "Reveal"}
            </button>
            <button
              type="button"
              onClick={handleCopyKey}
              className="rounded-lg bg-[#f97316] px-3 py-2 text-sm font-medium text-white hover:bg-[#ea580c]"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {licenseKey.activation_limit !== null ? (
            <p className="mt-3 text-xs text-slate-500">
              Activations: {licenseKey.activations_count ?? 0} of {licenseKey.activation_limit}
            </p>
          ) : null}
        </section>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {subscription.status === "active" || subscription.status === "on_trial" ? (
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Cancel subscription</h2>
          <p className="mt-1 text-sm text-slate-600">
            You&apos;ll keep access until the end of your current billing period.
          </p>
          {!showCancelConfirm ? (
            <button
              type="button"
              onClick={() => setShowCancelConfirm(true)}
              className="mt-4 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Cancel subscription
            </button>
          ) : (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-900">
                Are you sure? This will cancel your subscription at the end of the current period.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={cancelLoading}
                  onClick={handleCancelSubscription}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {cancelLoading ? "Cancelling…" : "Yes, cancel"}
                </button>
                <button
                  type="button"
                  disabled={cancelLoading}
                  onClick={() => setShowCancelConfirm(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Keep subscription
                </button>
              </div>
            </div>
          )}
        </section>
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
