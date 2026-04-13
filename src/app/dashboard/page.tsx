"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

declare global {
  interface Window {
    LemonSqueezy?: {
      Url?: {
        Open?: (url: string) => void;
      };
    };
  }
}

const variantIdByPlan: Record<string, string | undefined> = {
  monthly: process.env.NEXT_PUBLIC_LEMONSQUEEZY_MONTHLY_VARIANT_ID,
  annual: process.env.NEXT_PUBLIC_LEMONSQUEEZY_ANNUAL_VARIANT_ID,
};

export default function DashboardOverviewPage() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const checkoutPlan = searchParams.get("checkout");

    if (!checkoutPlan || !(checkoutPlan in variantIdByPlan)) {
      return;
    }

    const variantId = variantIdByPlan[checkoutPlan];

    if (!variantId) {
      console.error(`Missing variant id for checkout plan: ${checkoutPlan}`);
      return;
    }

    const startCheckout = async () => {
      try {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ variantId }),
        });

        if (!response.ok) {
          throw new Error("Failed to create checkout session");
        }

        const { checkoutUrl } = (await response.json()) as { checkoutUrl?: string };

        if (!checkoutUrl) {
          throw new Error("Missing checkout URL");
        }

        if (window.LemonSqueezy?.Url?.Open) {
          window.LemonSqueezy.Url.Open(checkoutUrl);
        } else {
          window.location.href = checkoutUrl;
        }
      } catch (error) {
        console.error("Unable to launch checkout", error);
      }
    };

    void startCheckout();
  }, [searchParams]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-slate-600">Welcome to your Influencer Butler dashboard.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Subscription Status</h2>
          <p className="mt-2 text-lg font-semibold text-slate-900">No active subscription</p>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">License Key</h2>
          <p className="mt-2 text-lg font-semibold text-slate-900">No license key</p>
        </article>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Quick Actions</h2>
        <p className="mt-1 text-sm text-slate-600">Get started by choosing your next step.</p>
        <button
          type="button"
          className="mt-4 rounded-lg bg-[#f97316] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#ea580c]"
        >
          Upgrade Plan
        </button>
      </article>
    </section>
  );
}
