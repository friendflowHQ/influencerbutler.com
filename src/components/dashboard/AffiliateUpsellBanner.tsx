"use client";

import { useEffect, useState } from "react";

type Offer = {
  tier: "20" | "30" | "50" | null;
  code: string | null;
};

const DISMISS_KEY_PREFIX = "ib_aff_upsell_dismissed_";

const TIER_HEADLINES: Record<Exclude<Offer["tier"], null>, { headline: string; sub: string; cta: string }> = {
  "20": {
    headline: "Affiliate perk: 20% off your first month",
    sub: "Try Influencer Butler for yourself — referrals convert way better when you actually use the product.",
    cta: "Claim 20% off",
  },
  "30": {
    headline: "Still thinking it over? Here's 30% off month one",
    sub: "We bumped your welcome offer. Use the code below at checkout.",
    cta: "Claim 30% off",
  },
  "50": {
    headline: "Final offer: 50% off your first month",
    sub: "Single-use code, generated just for you. After this, regular pricing applies.",
    cta: "Claim 50% off",
  },
};

export default function AffiliateUpsellBanner() {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/dashboard/affiliate-offer", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Offer;
        if (!alive) return;
        setOffer(data);

        if (data.tier) {
          const key = `${DISMISS_KEY_PREFIX}${data.tier}`;
          const hidden = typeof window !== "undefined" && sessionStorage.getItem(key) === "1";
          setDismissed(hidden);
        }
      } catch (error) {
        console.error("AffiliateUpsellBanner fetch failed", error);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (!offer || !offer.tier || !offer.code || dismissed) return null;

  const copy = TIER_HEADLINES[offer.tier];
  const checkoutUrl = `/pricing?code=${encodeURIComponent(offer.code)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(offer.code ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore — fallback: user selects the code text themselves
    }
  };

  const handleDismiss = () => {
    if (!offer.tier) return;
    try {
      sessionStorage.setItem(`${DISMISS_KEY_PREFIX}${offer.tier}`, "1");
    } catch {
      // sessionStorage may be unavailable — dismiss in-memory only
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Affiliate upsell"
      className="mb-6 rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-violet-50 p-5 shadow-sm"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-indigo-900">{copy.headline}</p>
          <p className="mt-1 text-sm text-slate-600">{copy.sub}</p>
          <div className="mt-3 flex items-center gap-2">
            <span className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 font-mono text-xs font-semibold tracking-wider text-indigo-900">
              {offer.code}
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="text-xs font-medium text-indigo-700 underline-offset-2 hover:underline"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={checkoutUrl}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {copy.cta}
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
