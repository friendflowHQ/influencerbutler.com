"use client";

import { useState } from "react";

const AVG_PLAN_PRICE = 49;
const COMMISSION_RATE = 0.35;

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function EarningsCalculator() {
  const [referrals, setReferrals] = useState(25);

  const monthly = referrals * AVG_PLAN_PRICE * COMMISSION_RATE;
  const yearly = monthly * 12;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 p-8 lg:grid-cols-[1fr_minmax(0,0.9fr)]">
        <div>
          <label className="block text-sm font-medium text-slate-700" htmlFor="referrals">
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
            Estimates assume an average plan price of {formatCurrency(AVG_PLAN_PRICE)}/month and a{" "}
            {(COMMISSION_RATE * 100).toFixed(0)}% recurring commission. Actual earnings depend on plan mix and
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
              After a full year
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
              {formatCurrency(yearly)}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            As long as your referrals keep their subscription, you keep earning — month after month.
          </p>
        </div>
      </div>
    </div>
  );
}
