"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/analytics-client";
import { SWITCH_OFFER_CODE, SWITCH_OFFER_WEEKS } from "@/lib/switch-fluencer-fruit";

// The offer's Lemon Squeezy code (100% off for the first six weeks, Solo
// monthly). The guest-checkout resolver picks the best-value code, so this
// beats any affiliate code for the discount slot while the affiliate still
// gets attribution. Mirrors src/app/founding-creator/FoundingCreatorCta.tsx.
const OFFER_CODE = SWITCH_OFFER_CODE;
const PLAN = "monthly"; // Solo monthly

type SubDetails = { subscription?: { status?: string } | null };

/**
 * Switch-offer CTA. Dedups existing subscribers (bounces them to their
 * dashboard), records an affiliate ?ref= for attribution, then opens the
 * card-required six-weeks-free checkout.
 */
export default function SwitchOfferCta({ refCode }: { refCode: string | null }) {
  const [state, setState] = useState<"checking" | "member" | "offer">("checking");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Record affiliate attribution (sets the ib_aff_src cookie the checkout reads).
  useEffect(() => {
    if (!refCode) return;
    fetch("/api/promo/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ affiliateSource: refCode, referrer: document.referrer || undefined }),
    }).catch(() => {
      // Non-fatal: checkout also reads the cookie / falls back gracefully.
    });
  }, [refCode]);

  // Dedup: an existing subscriber shouldn't claim the switch offer.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me/subscription-details");
        if (!alive) return;
        if (res.status === 401) {
          setState("offer"); // logged out - treat as a prospect
          return;
        }
        const data = (await res.json()) as SubDetails;
        const status = data.subscription?.status;
        setState(status === "active" || status === "on_trial" ? "member" : "offer");
      } catch {
        if (alive) setState("offer");
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function claim() {
    setLoading(true);
    setError(null);
    trackEvent("switch_fluencer_fruit_claim", {});
    try {
      const res = await fetch(
        `/api/checkout/guest?plan=${PLAN}&code=${encodeURIComponent(OFFER_CODE)}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        const { checkoutUrl } = (await res.json()) as { checkoutUrl?: string };
        if (checkoutUrl) {
          window.location.href = checkoutUrl;
          return;
        }
      }
      setError("Checkout is temporarily unavailable. Please try again in a moment.");
    } catch {
      setError("Checkout is temporarily unavailable. Please try again in a moment.");
    } finally {
      setLoading(false);
    }
  }

  if (state === "member") {
    return (
      <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        You are already a Pro member, so this switch offer is not needed.{" "}
        <a href="/dashboard" className="font-semibold underline">
          Open your dashboard
        </a>
        .
      </div>
    );
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={claim}
        disabled={loading || state === "checking"}
        className="inline-flex w-full items-center justify-center rounded-xl bg-[#f97316] px-6 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:cursor-wait disabled:opacity-70"
      >
        {loading ? "Opening secure checkout..." : `Claim my ${SWITCH_OFFER_WEEKS} weeks of Pro free`}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-center text-sm font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
