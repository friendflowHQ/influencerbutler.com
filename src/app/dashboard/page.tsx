"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LicenseKeyDisplay, { type LicenseKey } from "@/components/dashboard/LicenseKeyDisplay";
import DeviceManager from "@/components/dashboard/DeviceManager";
import DiscountCodesCard from "@/components/dashboard/DiscountCodesCard";
import GettingStartedChecklist from "@/components/dashboard/GettingStartedChecklist";

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

const ACTIVE_STATUSES = ["active", "on_trial"];

export default function DashboardOverviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [licenseKey, setLicenseKey] = useState<LicenseKey | null>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        // Service-role read (bypasses RLS) with an email -> Lemon Squeezy
        // fallback, so an active subscriber is recognized even when the
        // subscriptions row is RLS-hidden or not yet written by the webhook.
        const response = await fetch("/api/me/subscription-details");

        if (response.status === 401) {
          setLoading(false);
          return;
        }

        const payload = (await response.json()) as {
          subscription?: Subscription | null;
          licenseKey?: LicenseKey | null;
        };

        if (response.ok) {
          setSubscription(payload.subscription ?? null);
          setLicenseKey(payload.licenseKey ?? null);
        }
      } catch (err) {
        console.error("Failed to load subscription details", err);
      } finally {
        setLoading(false);
      }
    };

    void loadData();
  }, []);

  useEffect(() => {
    const checkoutPlan = searchParams.get("checkout");
    const promoCode = searchParams.get("code")?.trim() || undefined;

    if (checkoutPlan !== "monthly" && checkoutPlan !== "annual") {
      return;
    }

    const startCheckout = async () => {
      try {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ plan: checkoutPlan, code: promoCode }),
        });

        if (!response.ok) {
          throw new Error("Failed to create checkout session");
        }

        const { checkoutUrl } = (await response.json()) as { checkoutUrl?: string };

        if (!checkoutUrl) {
          throw new Error("Missing checkout URL");
        }

        // Full-page Lemon Squeezy hosted checkout, NOT the embedded overlay.
        // Removing an applied discount in the overlay could break out of the
        // iframe and land the buyer on a 404 (see index.html / PricingCardsClient).
        // A full-page checkout reloads LS's own page in place, so it is safe.
        window.location.href = checkoutUrl;
      } catch (error) {
        console.error("Unable to launch checkout", error);
      }
    };

    void startCheckout();
  }, [searchParams]);

  const hasActiveSub = subscription
    ? ACTIVE_STATUSES.includes(subscription.status)
    : false;

  const renewalDate = subscription?.renews_at
    ? new Date(subscription.renews_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const endsDate = subscription?.ends_at
    ? new Date(subscription.ends_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const renewalLine =
    subscription?.status === "cancelled" && endsDate
      ? `Access ends on ${endsDate}`
      : renewalDate
      ? `Renews on ${renewalDate}`
      : null;

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-slate-600">Welcome to your Influencer Butler dashboard.</p>
      </div>

      <GettingStartedChecklist />

      <DiscountCodesCard />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Subscription Status</h2>
          {loading ? (
            <div className="mt-3 h-7 w-40 animate-pulse rounded bg-slate-100" />
          ) : subscription ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <p className="text-lg font-semibold text-slate-900">
                  {subscription.plan_name ?? "Pro"}
                </p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getStatusBadge(subscription.status).className}`}
                >
                  {getStatusBadge(subscription.status).label}
                </span>
              </div>
              {renewalLine ? (
                <p className="mt-1 text-sm text-slate-600">{renewalLine}</p>
              ) : null}
            </>
          ) : (
            <p className="mt-2 text-lg font-semibold text-slate-900">No active subscription</p>
          )}
        </article>

        <LicenseKeyDisplay variant="card" licenseKey={licenseKey} loading={loading} />
      </div>

      {licenseKey ? <DeviceManager /> : null}

      <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Quick Actions</h2>
        <p className="mt-1 text-sm text-slate-600">
          {hasActiveSub
            ? "Manage your plan, billing, and license key."
            : "Get started by choosing your next step."}
        </p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/subscription")}
          className="mt-4 w-full sm:w-auto rounded-lg bg-[#f97316] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#ea580c]"
        >
          {hasActiveSub ? "Manage Subscription" : "Upgrade Plan"}
        </button>
      </article>
    </section>
  );
}
