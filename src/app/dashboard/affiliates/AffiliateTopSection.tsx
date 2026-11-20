"use client";

import { useState } from "react";
import { formatUsdFromCents } from "@/lib/affiliates";

/**
 * Top-of-dashboard pieces for the self-hosted affiliate dashboard:
 *  - EarningsHero: unpaid earnings first, next payout date, one-tap copy link.
 *  - PayoutPipeline: Upcoming > Clearing > Payable > Paid, plus a progress bar
 *    toward the $10 minimum payout.
 *  - GetPaidChecklist: tax form + PayPal checklist with jump-to buttons that
 *    collapses to a slim "ready" row once both are done.
 */

const MIN_PAYOUT_CENTS = 1000;

/** The 1st of next month, e.g. "Dec 1". Payouts run on or around the 1st. */
function nextPayoutLabel(now: Date = new Date()): { label: string; days: number } {
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const days = Math.max(1, Math.ceil((next.getTime() - now.getTime()) / 86_400_000));
  const label = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(next);
  return { label, days };
}

export function EarningsHero({
  unpaidCents,
  payableCents,
  shareLink,
  code,
}: {
  unpaidCents: number;
  payableCents: number;
  shareLink: string | null;
  code: string | null;
}) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const next = nextPayoutLabel();
  const meetsMinimum = payableCents >= MIN_PAYOUT_CENTS;

  const copy = async (text: string, which: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 2000);
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  return (
    <section
      aria-labelledby="aff-hero-label"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p
            id="aff-hero-label"
            className="text-xs font-semibold uppercase tracking-wider text-slate-500"
          >
            Unpaid earnings
          </p>
          <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">
            {formatUsdFromCents(unpaidCents)}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            {meetsMinimum
              ? `Next payout: ${next.label} (in ${next.days} ${next.days === 1 ? "day" : "days"})`
              : `Payouts start once ${formatUsdFromCents(MIN_PAYOUT_CENTS)} is available. Next run: ${next.label}.`}
          </p>
        </div>

        {shareLink || code ? (
          <div className="flex flex-wrap gap-2" aria-live="polite">
            {shareLink ? (
              <button
                type="button"
                onClick={() => copy(shareLink, "link")}
                className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                {copied === "link" ? "Link copied" : "Copy my link"}
              </button>
            ) : null}
            {code ? (
              <button
                type="button"
                onClick={() => copy(code, "code")}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
              >
                {copied === "code" ? "Code copied" : `Copy code ${code}`}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PipelineStep({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <li
      className={`rounded-lg p-3 ${highlight ? "bg-orange-50 ring-1 ring-orange-200" : "bg-slate-50"}`}
    >
      <p
        className={`text-xs font-semibold uppercase tracking-wider ${highlight ? "text-orange-800" : "text-slate-500"}`}
      >
        {label}
      </p>
      <p
        className={`mt-1 text-lg font-bold tracking-tight ${highlight ? "text-orange-800" : "text-slate-900"}`}
      >
        {value}
      </p>
      <p className={`text-xs ${highlight ? "text-orange-800" : "text-slate-500"}`}>{hint}</p>
    </li>
  );
}

export function PayoutPipeline({
  upcomingCents,
  clearingCents,
  payableCents,
  paidCents,
}: {
  upcomingCents: number;
  clearingCents: number;
  payableCents: number;
  paidCents: number;
}) {
  const next = nextPayoutLabel();
  const pct = Math.min(100, Math.round((payableCents / MIN_PAYOUT_CENTS) * 100));
  const meetsMinimum = payableCents >= MIN_PAYOUT_CENTS;

  return (
    <section
      aria-labelledby="aff-pipeline-title"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="aff-pipeline-title" className="text-sm font-semibold text-slate-900">
          Where your money is
        </h2>
        <details className="group text-sm">
          <summary className="cursor-pointer font-medium text-orange-700 hover:text-orange-800">
            How payouts work
          </summary>
          <p className="mt-2 max-w-md text-xs text-slate-600 sm:text-right">
            Each order&apos;s commission clears after a short hold (about 14 days, to cover any
            dispute), then pays out on or around the 1st once your balance reaches $10. Annual plans
            are paid a month at a time across the year. PayPal fees are not covered, so the amount
            that lands may be slightly less.
          </p>
        </details>
      </div>

      <ol className="mt-3 grid gap-3 sm:grid-cols-4">
        <PipelineStep label="Upcoming" value={formatUsdFromCents(upcomingCents)} hint="Annual plan months" />
        <PipelineStep label="Clearing" value={formatUsdFromCents(clearingCents)} hint="~14-day hold" />
        <PipelineStep
          label="Payable"
          value={formatUsdFromCents(payableCents)}
          hint={meetsMinimum ? `Pays ${next.label}` : "Below $10 minimum"}
          highlight
        />
        <PipelineStep label="Paid" value={formatUsdFromCents(paidCents)} hint="To date" />
      </ol>

      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-600">
          <span>Payable balance: {formatUsdFromCents(payableCents)}</span>
          <span>
            {meetsMinimum
              ? "$10 minimum met"
              : `${formatUsdFromCents(MIN_PAYOUT_CENTS - payableCents)} to the $10 minimum`}
          </span>
        </div>
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"
          role="progressbar"
          aria-label="Progress toward the $10 minimum payout"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div
            className={`h-full rounded-full ${meetsMinimum ? "bg-emerald-600" : "bg-orange-700"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </section>
  );
}

type TaxStatus = "not_submitted" | "submitted" | "verified" | "rejected";

function jumpTo(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusable = el.querySelector<HTMLElement>("input, button, select, textarea");
  focusable?.focus({ preventScroll: true });
}

function CheckRow({
  done,
  title,
  hint,
  action,
  onAction,
}: {
  done: boolean;
  title: string;
  hint: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-t border-slate-100 py-3 first:border-t-0">
      <span
        aria-hidden="true"
        className={`flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-bold ${
          done
            ? "border-emerald-700 bg-emerald-50 text-emerald-700"
            : "border-slate-300 text-transparent"
        }`}
      >
        {done ? "✓" : "."}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${done ? "text-slate-500 line-through" : "font-medium text-slate-900"}`}>
          {title}
          <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
        </p>
        {!done ? <p className="text-xs text-slate-600">{hint}</p> : null}
      </div>
      {!done && action && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="flex-none rounded-lg border border-orange-700 px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          {action}
        </button>
      ) : null}
    </li>
  );
}

export function GetPaidChecklist({
  taxStatus,
  payoutReady,
  readOnly,
}: {
  taxStatus: TaxStatus;
  payoutReady: boolean;
  readOnly: boolean;
}) {
  const taxReady = taxStatus === "verified";
  const done = Number(taxReady) + Number(payoutReady);

  if (done === 2) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <span aria-hidden="true">{"✓"}</span>
        <span className="font-medium">Payouts are set up</span>
        <span className="text-emerald-800">: tax form verified and PayPal email saved.</span>
      </div>
    );
  }

  const taxHint =
    taxStatus === "submitted"
      ? "Submitted. We're reviewing it, no action needed."
      : taxStatus === "rejected"
        ? "We couldn't accept your last form. Resubmit it to get paid."
        : "W-9 or W-8BEN, takes about 2 minutes.";
  const taxAction =
    readOnly || taxStatus === "submitted"
      ? undefined
      : taxStatus === "rejected"
        ? "Resubmit"
        : "Add now";

  return (
    <section
      aria-labelledby="aff-checklist-title"
      className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="aff-checklist-title" className="text-sm font-semibold text-slate-900">
          Get paid: {done} of 2 done
        </h2>
        <p className="text-xs text-slate-600">You can share and earn before finishing these.</p>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-white"
        role="progressbar"
        aria-label="Payout setup progress"
        aria-valuemin={0}
        aria-valuemax={2}
        aria-valuenow={done}
      >
        <div className="h-full rounded-full bg-orange-700" style={{ width: `${done * 50}%` }} />
      </div>
      <ul className="mt-2">
        <CheckRow
          done={taxReady}
          title="Tax form (W-9 / W-8BEN)"
          hint={taxHint}
          action={taxAction}
          onAction={() => jumpTo("aff-tax-card")}
        />
        <CheckRow
          done={payoutReady}
          title="PayPal payout email"
          hint="Where we send your monthly payout."
          action={readOnly ? undefined : "Add now"}
          onAction={() => jumpTo("aff-payout-card")}
        />
      </ul>
    </section>
  );
}
