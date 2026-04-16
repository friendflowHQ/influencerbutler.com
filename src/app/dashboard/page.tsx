"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

export default function DashboardOverviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

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
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Overview</h1>
        <p className="mt-1 text-sm text-slate-600">Welcome to your Influencer Butler dashboard.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
          <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">Subscription Status</h2>
          <p className="mt-2 text-lg font-semibold text-slate-900">No active subscription</p>
        </article>

        <LicenseKeyDisplay variant="card" />
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Quick Actions</h2>
        <p className="mt-1 text-sm text-slate-600">Get started by choosing your next step.</p>
        <button
          type="button"
          onClick={() => router.push("/dashboard/subscription")}
          className="mt-4 w-full sm:w-auto rounded-lg bg-[#f97316] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#ea580c]"
        >
          Upgrade Plan
        </button>
      </article>
    </section>
  );
}
