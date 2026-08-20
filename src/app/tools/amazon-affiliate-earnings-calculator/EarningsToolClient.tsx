"use client";

import { useMemo, useState } from "react";
import {
  ASSOCIATE_RATES,
  DEFAULT_ASSOCIATE_RATE_LABEL,
} from "@/lib/associate-rates";

function currency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

const DEFAULT_RATE =
  ASSOCIATE_RATES.find((r) => r.label === DEFAULT_ASSOCIATE_RATE_LABEL) ?? ASSOCIATE_RATES[0];

export default function EarningsToolClient() {
  const [clicks, setClicks] = useState(2000);
  const [conversion, setConversion] = useState(4);
  const [aov, setAov] = useState(45);
  const [rateLabel, setRateLabel] = useState(DEFAULT_RATE.label);

  const ratePct = useMemo(
    () => ASSOCIATE_RATES.find((r) => r.label === rateLabel)?.ratePct ?? DEFAULT_RATE.ratePct,
    [rateLabel],
  );

  const monthlyOrders = clicks * (conversion / 100);
  const monthlyRevenue = monthlyOrders * aov;
  const monthlyCommission = monthlyRevenue * (ratePct / 100);
  const yearlyCommission = monthlyCommission * 12;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 p-8 lg:grid-cols-[1fr_minmax(0,0.9fr)]">
        {/* Inputs */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="clicks">
              Affiliate link clicks per month
            </label>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-4xl font-bold tracking-tight text-slate-900">
                {clicks.toLocaleString()}
              </span>
              <span className="text-sm text-slate-500">clicks / month</span>
            </div>
            <input
              id="clicks"
              type="range"
              min={100}
              max={50000}
              step={100}
              value={clicks}
              onChange={(e) => setClicks(Number(e.target.value))}
              className="mt-4 w-full accent-[#f97316]"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="conversion">
              Conversion rate: {conversion}%
            </label>
            <input
              id="conversion"
              type="range"
              min={1}
              max={20}
              step={0.5}
              value={conversion}
              onChange={(e) => setConversion(Number(e.target.value))}
              className="mt-3 w-full accent-[#f97316]"
            />
            <p className="mt-1 text-xs text-slate-500">
              Share of clicks that turn into a purchase. Amazon affiliate links commonly land
              between 3% and 8%.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="aov">
                Average order value
              </label>
              <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
                <span className="text-slate-500">$</span>
                <input
                  id="aov"
                  type="number"
                  min={1}
                  value={aov}
                  onChange={(e) => setAov(Math.max(0, Number(e.target.value)))}
                  className="w-full bg-transparent px-2 py-2.5 text-slate-900 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="category">
                Category
              </label>
              <select
                id="category"
                value={rateLabel}
                onChange={(e) => setRateLabel(e.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none"
              >
                {ASSOCIATE_RATES.map((r) => (
                  <option key={r.label} value={r.label}>
                    {r.label} ({r.ratePct}%)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            Assumes a {ratePct}% commission rate. Amazon can change category rates, and rates apply
            to qualifying purchases within the cookie window. Figures are estimates.
          </p>
        </div>

        {/* Output */}
        <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Estimated monthly commission
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-[#f97316]">
              {currency(monthlyCommission)}
            </p>
          </div>
          <div className="border-t border-orange-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Estimated yearly commission
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
              {currency(yearlyCommission)}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 border-t border-orange-100 pt-4 text-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Orders / month
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {Math.round(monthlyOrders).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Sales driven / month
              </p>
              <p className="mt-1 text-lg font-semibold text-slate-900">
                {currency(monthlyRevenue)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
