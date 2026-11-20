"use client";

import { useEffect, useState } from "react";

/**
 * Performance tab summary: clicks to signups to trials to paying customers as
 * percentages, plus a progress bar toward the next paying-referral milestone.
 */

type FunnelStats = { signups: number; trialsStarted: number; paid: number };

const MILESTONES = [1, 5, 10, 25, 50, 100, 250];

function pct(part: number, whole: number): string {
  if (whole <= 0) return "-";
  return `${Math.round((part / whole) * 100)}%`;
}

export default function ConversionGoal({
  clicksEndpoint = "/api/affiliates/clicks",
  referredSignupsEndpoint = "/api/affiliates/referred-signups",
}: {
  clicksEndpoint?: string;
  referredSignupsEndpoint?: string;
}) {
  const [clicks, setClicks] = useState<number | null>(null);
  const [funnel, setFunnel] = useState<FunnelStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const from = new Date(now.getTime() - 90 * 86_400_000).toISOString();
        const [c, f] = await Promise.all([
          fetch(clicksEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: now.toISOString() }),
            cache: "no-store",
          }),
          fetch(referredSignupsEndpoint, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (!c.ok || !f.ok) {
          setFailed(true);
          return;
        }
        setClicks(((await c.json()) as { total: number }).total ?? 0);
        setFunnel(((await f.json()) as { funnel: FunnelStats }).funnel);
      } catch (err) {
        console.warn("conversion goal fetch skipped", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clicksEndpoint, referredSignupsEndpoint]);

  if (failed || clicks === null || !funnel) return null;

  const next = MILESTONES.find((m) => funnel.paid < m) ?? null;
  const prev = [...MILESTONES].reverse().find((m) => funnel.paid >= m) ?? 0;
  const progress = next ? Math.round(((funnel.paid - prev) / (next - prev)) * 100) : 100;

  const steps: { label: string; value: number; rate: string }[] = [
    { label: "Clicks", value: clicks, rate: "last 90 days" },
    { label: "Signups", value: funnel.signups, rate: `${pct(funnel.signups, clicks)} of clicks` },
    { label: "Trials", value: funnel.trialsStarted, rate: `${pct(funnel.trialsStarted, funnel.signups)} of signups` },
    { label: "Paying", value: funnel.paid, rate: `${pct(funnel.paid, funnel.trialsStarted)} of trials` },
  ];

  return (
    <section
      aria-labelledby="aff-conv-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <h2 id="aff-conv-title" className="text-sm font-semibold text-slate-900">
        How visitors become customers
      </h2>
      <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {steps.map((s) => (
          <li key={s.label} className="rounded-lg bg-slate-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{s.label}</p>
            <p className="mt-1 text-xl font-bold tracking-tight text-slate-900">{s.value}</p>
            <p className="text-xs text-slate-600">{s.rate}</p>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        Clicks cover the last 90 days. Signups, trials and paying customers are all-time for your
        link, so the percentages are a guide rather than an exact ratio.
      </p>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-600">
          <span>{funnel.paid} paying {funnel.paid === 1 ? "referral" : "referrals"}</span>
          <span>{next ? `Next milestone: ${next}` : "Top milestone reached"}</span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Progress toward your next paying-referral milestone"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="h-full rounded-full bg-orange-700" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </section>
  );
}
