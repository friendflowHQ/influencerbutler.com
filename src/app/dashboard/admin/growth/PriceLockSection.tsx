"use client";

// Growth page: "Price lock push" card (Nov 12 - Nov 30 2026). Results since
// Nov 12: trials, conversions, comps that added a card, returning customers,
// new MRR against the $1,000 goal, and each cold group (E1 clicked, E2 opened,
// E3 neither). Data from /api/admin/growth/price-lock. Hidden on any error.

import { useEffect, useState } from "react";

type Cold = { members: number; sent: number; clicked: number; trials: number; paid: number };
type Data = {
  since: string;
  trialStarts: number;
  cardTrialStarts: number;
  noCardTrialStarts: number;
  trialsConverted: number;
  compsAddedCard: number;
  returnedCustomers: number;
  newMrrCents: number;
  pendingTrialMrrCents: number;
  goalCents: number;
  cold: Record<"E1" | "E2" | "E3", Cold>;
};

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

const GROUP_LABEL: Record<"E1" | "E2" | "E3", string> = {
  E1: "E1 clicked",
  E2: "E2 opened, no click",
  E3: "E3 did not open",
};

export default function PriceLockSection() {
  const [data, setData] = useState<Data | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/growth/price-lock", { cache: "no-store" })
      .then(async (res) => {
        if (!alive) return;
        if (!res.ok) return setHidden(true);
        setData((await res.json()) as Data);
      })
      .catch(() => alive && setHidden(true));
    return () => {
      alive = false;
    };
  }, []);

  if (hidden) return null;

  const pct = data ? Math.min(100, Math.round((data.newMrrCents / Math.max(1, data.goalCents)) * 100)) : 0;
  const tiles: [string, string, string?][] = data
    ? [
        ["Trial starts", String(data.trialStarts), `${data.cardTrialStarts} with card, ${data.noCardTrialStarts} no card`],
        ["Trials converted", String(data.trialsConverted)],
        ["Comps added a card", String(data.compsAddedCard)],
        ["Cancelled customers back", String(data.returnedCustomers)],
      ]
    : [];

  return (
    <section className="mt-10" aria-labelledby="price-lock-heading">
      <h2 id="price-lock-heading" className="text-sm font-semibold uppercase tracking-wider text-slate-700">
        Price lock push
      </h2>
      <p className="mt-1 text-xs text-slate-500">Since Nov 12 (Pacific). Prices go up after Nov 30 at 11:59pm Pacific.</p>
      {!data ? (
        <div className="mt-3 h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
      ) : (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-5">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">New MRR</p>
              <p className="text-sm tabular-nums text-slate-700">
                <span className="text-lg font-semibold text-slate-900">{money(data.newMrrCents)}</span> of {money(data.goalCents)} goal
              </p>
            </div>
            <div
              className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-label="New MRR toward goal"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div className="h-full rounded-full bg-emerald-700" style={{ width: `${pct}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Plus {money(data.pendingTrialMrrCents)} a month in trials that have not converted yet.
            </p>
          </div>

          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map(([label, value, hint]) => (
              <div key={label} className="rounded-lg border border-slate-200 p-3">
                <dt className="text-xs font-medium text-slate-500">{label}</dt>
                <dd className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
                {hint ? <dd className="text-xs text-slate-500">{hint}</dd> : null}
              </div>
            ))}
          </dl>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="sr-only">Cold email groups</caption>
              <thead>
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-medium">Cold group</th>
                  <th scope="col" className="py-2 pr-3 font-medium">People</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Emails sent</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Clicked</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Trials started</th>
                  <th scope="col" className="py-2 font-medium">Paid</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {(["E1", "E2", "E3"] as const).map((g) => (
                  <tr key={g} className="border-t border-slate-100">
                    <th scope="row" className="py-2 pr-3 font-medium text-slate-900">{GROUP_LABEL[g]}</th>
                    <td className="py-2 pr-3">{data.cold[g].members}</td>
                    <td className="py-2 pr-3">{data.cold[g].sent}</td>
                    <td className="py-2 pr-3">{data.cold[g].clicked}</td>
                    <td className="py-2 pr-3">{data.cold[g].trials}</td>
                    <td className="py-2">{data.cold[g].paid}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
