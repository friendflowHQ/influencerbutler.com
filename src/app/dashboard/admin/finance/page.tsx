"use client";

// Admin Finance dashboard: the "real-time CPA". Revenue recognition (safe to
// spend), Lemon Squeezy bank payouts (estimate + confirm), expenses, quarterly
// tax planning, and the exportable P&L. Access requires the finance permission
// AND an email 2FA code (StepUpGate); all data comes from /api/admin/finance/*.

import { useCallback, useEffect, useState } from "react";
import StepUpGate from "./StepUpGate";
import RevenueTab from "./RevenueTab";
import PayoutsTab from "./PayoutsTab";
import ExpensesTab from "./ExpensesTab";
import TaxesTab from "./TaxesTab";
import FilingsTab from "./FilingsTab";
import ReportTab from "./ReportTab";
import SettingsTab from "./SettingsTab";
import { usd, shortDate } from "./format";

type Buckets = {
  collectedCents: number;
  earnedCents: number;
  deferredCents: number;
  releasableCents: number;
  heldCents: number;
  orderCount: number;
};

type Forecast = {
  estimatedNetAllTimeCents: number;
  estimatedFeesAllTimeCents: number;
  recordedPayoutsCents: number;
  estimatedUnpaidCents: number;
  nextPayoutDate: string;
  nextPayoutEstimateCents: number;
  driftCents: number | null;
};

type OverviewResponse = {
  ok?: boolean;
  migrationPending?: boolean;
  stepUpRequired?: boolean;
  error?: string;
  buckets?: Buckets;
  forecast?: Forecast;
  enrichment?: { enrichedCount: number; totalOrders: number };
  settings?: { refundHoldDays: number };
  tax?: {
    nextDeadline: { quarter: number; periodStart: string; periodEnd: string; dueDate: string };
    daysUntilDeadline: number;
    quarterNetProfitCents: number;
    setAside: { seTaxCents: number; federalCents: number; utahCents: number; totalCents: number };
    morEducation: string;
    taxMode: string;
  };
};

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "revenue", label: "Revenue" },
  { key: "payouts", label: "Payouts" },
  { key: "expenses", label: "Expenses" },
  { key: "taxes", label: "Taxes" },
  { key: "filings", label: "1099s" },
  { key: "report", label: "Report" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold" style={{ color: accent ?? "#0f172a" }}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export default function AdminFinancePage() {
  const [tab, setTab] = useState<TabKey>("overview");
  const [forbidden, setForbidden] = useState(false);
  const [stepUpRequired, setStepUpRequired] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [overview, setOverview] = useState<OverviewResponse | null>(null);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch("/api/admin/finance/overview", { cache: "no-store" });
      const json = (await res.json()) as OverviewResponse;
      if (res.status === 403) {
        if (json.stepUpRequired) setStepUpRequired(true);
        else setForbidden(true);
        return;
      }
      if (json.migrationPending) {
        setMigrationPending(true);
        return;
      }
      if (!res.ok) {
        setFetchError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setStepUpRequired(false);
      setOverview(json);
    } catch {
      setFetchError("Network error. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  if (stepUpRequired) {
    return <StepUpGate onVerified={() => void loadOverview()} />;
  }

  if (migrationPending) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h1 className="text-lg font-semibold text-amber-900">Migration pending</h1>
          <p className="mt-2 text-sm text-amber-800">
            The finance tables have not been applied to production Supabase yet. Run
            supabase/migrations/20260827_finance.sql against prod, then reload this page.
          </p>
        </div>
      </div>
    );
  }

  const buckets = overview?.buckets;
  const forecast = overview?.forecast;
  const tax = overview?.tax;
  const enrichment = overview?.enrichment;
  const showDeadlineBanner = tax && tax.daysUntilDeadline >= 0 && tax.daysUntilDeadline <= 30;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Finance</h1>
          <p className="mt-1 text-sm text-slate-600">
            Revenue recognition, bank payouts, expenses, and tax planning. Planning estimates, not
            tax advice.
          </p>
        </div>
      </div>

      {showDeadlineBanner && tax ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span className="font-semibold">
            Q{tax.nextDeadline.quarter} estimated taxes due {shortDate(tax.nextDeadline.dueDate)}
          </span>{" "}
          ({tax.daysUntilDeadline} day{tax.daysUntilDeadline === 1 ? "" : "s"} away): recommended
          set-aside so far {usd(tax.setAside.totalCents)}. Details in the Taxes tab.
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={[
              "rounded-t-lg px-4 py-2 text-sm font-medium",
              tab === t.key
                ? "border border-b-0 border-slate-200 bg-white text-slate-900"
                : "text-slate-500 hover:text-slate-800",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {fetchError ? (
        <p className="mt-6 text-sm text-rose-600">{fetchError}</p>
      ) : null}

      {tab === "overview" ? (
        loading || !buckets || !forecast ? (
          <p className="mt-6 text-sm text-slate-500">Loading...</p>
        ) : (
          <div className="mt-6 space-y-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Safe to release"
                value={usd(buckets.releasableCents)}
                hint="Earned and past the refund window: OK to pay the team"
                accent="#059669"
              />
              <StatCard
                label="Earned to date"
                value={usd(buckets.earnedCents)}
                hint={`Includes ${usd(buckets.heldCents)} still in the refund window`}
              />
              <StatCard
                label="Deferred revenue"
                value={usd(buckets.deferredCents)}
                hint="Collected but the service is still owed (don't spend yet)"
                accent="#d97706"
              />
              <StatCard
                label="Collected (net of tax)"
                value={usd(buckets.collectedCents)}
                hint={`${buckets.orderCount} paid orders, after refunds`}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Est. next LS payout"
                value={usd(forecast.nextPayoutEstimateCents)}
                hint={`Expected around ${shortDate(forecast.nextPayoutDate)}`}
                accent="#4f46e5"
              />
              <StatCard
                label="Est. balance at LS"
                value={usd(forecast.estimatedUnpaidCents)}
                hint="Estimated net revenue not yet paid out to the bank"
              />
              <StatCard
                label="Payouts received"
                value={usd(forecast.recordedPayoutsCents)}
                hint="Recorded in the Payouts tab"
              />
              <StatCard
                label="Est. LS fees (lifetime)"
                value={usd(forecast.estimatedFeesAllTimeCents)}
                hint="Configurable estimate; calibrate in Settings"
              />
            </div>

            {tax ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
                <p className="font-semibold text-slate-900">
                  Q{tax.nextDeadline.quarter} tax set-aside so far: {usd(tax.setAside.totalCents)}
                </p>
                <p className="mt-1">
                  Quarter net profit {usd(tax.quarterNetProfitCents)}: federal{" "}
                  {usd(tax.setAside.federalCents)}
                  {tax.setAside.seTaxCents > 0
                    ? `, self-employment ${usd(tax.setAside.seTaxCents)}`
                    : ""}
                  , Utah {usd(tax.setAside.utahCents)}. Due {shortDate(tax.nextDeadline.dueDate)}.
                </p>
                <p className="mt-2 text-xs text-slate-500">{tax.morEducation}</p>
              </div>
            ) : null}

            {enrichment && enrichment.enrichedCount < enrichment.totalOrders ? (
              <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                {enrichment.totalOrders - enrichment.enrichedCount} of {enrichment.totalOrders}{" "}
                orders are missing exact tax/fee figures (numbers are approximate for them). Run the
                Lemon Squeezy backfill from the Settings tab to fix this.
              </div>
            ) : null}
          </div>
        )
      ) : null}

      {tab === "revenue" ? <RevenueTab /> : null}
      {tab === "payouts" ? <PayoutsTab /> : null}
      {tab === "expenses" ? <ExpensesTab /> : null}
      {tab === "taxes" ? <TaxesTab /> : null}
      {tab === "filings" ? <FilingsTab /> : null}
      {tab === "report" ? <ReportTab /> : null}
      {tab === "settings" ? <SettingsTab onSettingsChanged={() => void loadOverview()} /> : null}
    </div>
  );
}
