"use client";

import Script from "next/script";
import { useState } from "react";
import { ADDON_PLAN_DAILY_DEALS } from "@/lib/pricing-constants";

type LemonSqueezyWindow = Window & {
  LemonSqueezy?: { Url?: { Open?: (url: string) => void } };
};

function openCheckout(url: string): void {
  const w = window as LemonSqueezyWindow;
  if (w.LemonSqueezy?.Url?.Open) {
    try {
      const u = new URL(url);
      u.searchParams.set("embed", "1");
      w.LemonSqueezy.Url.Open(u.toString());
      return;
    } catch {
      /* fall through to direct navigation */
    }
  }
  window.location.href = url;
}

function hasAuthCookie(): boolean {
  return document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .some((entry) => /^sb-[^=]+-auth-token=/.test(entry));
}

type Props = {
  signedIn: boolean;
  label?: string;
  className?: string;
};

/**
 * Buy CTA for the Daily Deals Workspace add-on. Hardcodes
 * `plan: "daily-deals-addon"` and intentionally NEVER passes `code` or
 * `affiliateSource` — the add-on does not accept promo or affiliate
 * codes. The triple-belt promo-exclusion contract in the checkout
 * routes + LS-side variant scoping enforces this even if we somehow
 * leaked a code into the request.
 */
export default function BuyAddonButton({ signedIn, label, className }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      if (signedIn && hasAuthCookie()) {
        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: ADDON_PLAN_DAILY_DEALS }),
        });
        if (response.status !== 401 && response.ok) {
          const payload = (await response.json()) as { checkoutUrl?: string };
          if (payload.checkoutUrl) {
            openCheckout(payload.checkoutUrl);
            return;
          }
        }
        // 401 or missing url → fall through to guest flow.
      }
      const guestUrl = `/api/checkout/guest?plan=${ADDON_PLAN_DAILY_DEALS}`;
      const guestResponse = await fetch(guestUrl, {
        headers: { Accept: "application/json" },
      });
      if (guestResponse.ok) {
        const { checkoutUrl } = (await guestResponse.json()) as { checkoutUrl?: string };
        if (checkoutUrl) {
          openCheckout(checkoutUrl);
          return;
        }
      }
      window.location.href = guestUrl;
    } catch (error) {
      console.error("Daily Deals add-on checkout failed", error);
      window.location.href = `/api/checkout/guest?plan=${ADDON_PLAN_DAILY_DEALS}`;
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Script src="https://assets.lemonsqueezy.com/lemon.js" strategy="afterInteractive" />
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={
          className ??
          "inline-flex items-center justify-center rounded-lg bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f97316] disabled:cursor-progress disabled:opacity-70"
        }
      >
        {loading ? "Opening checkout…" : label ?? "Buy — $24.99/month"}
      </button>
    </>
  );
}
