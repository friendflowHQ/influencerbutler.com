"use client";

import { useMemo, useState } from "react";
import { estMonthlySales, seedCurveFor } from "@/lib/market-estimate";

// Display labels chosen to match the seed-curve families in market-estimate.ts
// (seedCurveFor does a substring match against these).
const CATEGORIES = [
  "Electronics",
  "Home & Kitchen",
  "Toys & Games",
  "Beauty",
  "Health & Household",
  "Sports & Outdoors",
  "Clothing, Shoes & Jewelry",
  "Grocery & Gourmet Food",
  "Tools & Home Improvement",
  "Office Products",
  "Pet Supplies",
  "Books",
];

export default function SalesEstimatorClient() {
  const [rank, setRank] = useState(5000);
  const [category, setCategory] = useState(CATEGORIES[0]);

  const monthly = useMemo(
    () => estMonthlySales(rank, seedCurveFor(category)),
    [rank, category],
  );
  const daily = monthly != null ? Math.round(monthly / 30) : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 p-8 lg:grid-cols-[1fr_minmax(0,0.9fr)]">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="rank">
              Best Sellers Rank (BSR)
            </label>
            <div className="mt-2 flex items-center rounded-xl border border-slate-200 bg-slate-50 px-3">
              <span className="text-slate-500">#</span>
              <input
                id="rank"
                type="number"
                min={1}
                value={rank}
                onChange={(e) => setRank(Math.max(1, Number(e.target.value)))}
                className="w-full bg-transparent px-2 py-2.5 text-slate-900 outline-none"
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Find this in the &quot;Product information&quot; section of any Amazon listing, shown
              as &quot;Best Sellers Rank: #12,345 in Home &amp; Kitchen&quot;.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="category">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-slate-900 outline-none"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <p className="text-xs text-slate-500">
            Estimates use a category sales curve fit to real rank-and-sales data. Different
            categories sell at very different volumes for the same rank, so pick the closest one.
          </p>
        </div>

        <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50 p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Estimated sales per month
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-[#f97316]">
              {monthly != null ? `${monthly.toLocaleString()} units` : "-"}
            </p>
          </div>
          <div className="border-t border-orange-100 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Estimated sales per day
            </p>
            <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
              {daily != null ? `${daily.toLocaleString()} units` : "-"}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            A rough estimate for gauging demand, not an exact figure. The lower the rank number, the
            more a product sells.
          </p>
        </div>
      </div>
    </div>
  );
}
