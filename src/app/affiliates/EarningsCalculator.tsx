"use client";

import { useState } from "react";
import { PRICE_CENTS, TIER_NAME, type Tier } from "@/lib/pricing-constants";

const COMMISSION_RATE = 0.3;
// Affiliate commissions cap at this many months per referred customer.
const COMMISSION_DURATION_MONTHS = 12;

const TIERS: Tier[] = ["solo", "team", "agency"];

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function EarningsCalculator() {
  const [referrals, setReferrals] = useState(25);
  const [tier, setTier] = useState<Tier>("solo");

  const planPrice = PRICE_CENTS[tier].monthly / 100;
  const monthly = referrals * planPrice * COMMISSION_RATE;
  const yearly = monthly * COMMISSION_DURATION_MONTHS;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 p-8 lg:grid-cols-[1fr_minmax(0,0.9fr)]">
        <div>
          <span className="block text-sm font-medium text-slate-700">Plan they subscribe to</span>
          <div
            className="mt-3 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
            role="group"
            aria-label="Plan tier"
          >
            {TIERS.map((t) => {
              const active = t === tier;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTier(t)}
                  aria-pressed={active}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                    active
                      ? "bg-[#f97316] text-white shadow-sm"
                      : "text-slate-600 hover:text-[#f97316]"
                  }`}
                >
                  {TIER_NAME[t]}
                  <span className={`ml-1 text-xs font-normal ${active ? "text-white/80" : "text-slate-400"}`}>
                    {formatCurrency(PRICE_CENTS[t].monthly / 100)}/mo
                  </span>
                </button>
              );
            })}
          </div>

          <label className="mt-6 block text-sm font-medium text-slate-700" htmlFor="referrals">
            Active paying referrals
          </label>
          <div className="mt-3 flex items-baseline gap-3">
            <span className="text-5xl font-bold tracking-tight text-slate-900">{referrals}</span>
            <span className="text-sm text-slate-500">subscribers you refer</span>
          </div>
          <input
            id="referrals"
            type="range"
            min={1}
            max={250}
            value={referrals}
            onChange={(e) => setReferrals(Number(e.target.value))}
            className="mt-5 w-full accent-[#f97316]"
          />
          <div className="mt-2 flex justify-between text-xs text-slate-400">
            <span>1</span>
            <span>250</span>
          </div>
          <p className="mt-6 text-xs text-slate-500">
            Estimates assume {referrals} referrals on the {TIER_NAME[tier]} plan ({formatCurrency(planPrice)}/month)
            and a {(COMMISSION_RATE * 100).toFixed(0)}% recurring commission, paid for the first{" "}
            {COMMISSION_DURATION_MONTHS} months of each subscription. Actual earnings depend on plan mix and
            retention.
          </p>
        </div>
        <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Estimated monthly commission
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-[#f97316]">
              {formatCurrency(monthly)}
            </p>
          </div>
          <div className="border-t border-orange-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Total over 12 months
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
              {formatCurrency(yearly)}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            You earn 30% recurring on each referred subscription for the first 12 months they stay subscribed.
          </p>
        </div>
      </div>
    </div>
  );
}
