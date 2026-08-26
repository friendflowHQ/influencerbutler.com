"use client";

// Settings tab: every finance planning parameter (LS fee estimate, payout
// schedule, refund hold, tax mode + rates, PayPal sender fee) plus the
// Lemon Squeezy order backfill (dry-run preview, then live).

import { useCallback, useEffect, useState } from "react";

type Settings = {
  lsFeePercent: number;
  lsFeeFixedCents: number;
  lsPayoutDayOfMonth: number;
  lsPayoutNetDelayDays: number;
  refundHoldDays: number;
  taxMode: "passthrough" | "scorp";
  federalRatePercent: number;
  utahRatePercent: number;
  seTaxRatePercent: number;
  seTaxBasePercent: number;
  scorpDistributionRatePercent: number;
  paypalSenderFeePerPayoutCents: number;
};

type Props = { onSettingsChanged: () => void };

export default function SettingsTab({ onSettingsChanged }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMessage, setBackfillMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/finance/settings", { cache: "no-store" });
      const json = (await res.json()) as { settings?: Settings; error?: string };
      if (!res.ok || !json.settings) {
        setError(json.error ?? "Could not load settings.");
        return;
      }
      setSettings(json.settings);
    } catch {
      setError("Network error.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/finance/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = (await res.json()) as { ok?: boolean; settings?: Settings; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Save failed.");
        return;
      }
      if (json.settings) setSettings(json.settings);
      setSaved(true);
      onSettingsChanged();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  };

  const runBackfill = async () => {
    setBackfillBusy(true);
    setBackfillMessage(null);
    try {
      const dryRes = await fetch("/api/admin/finance/backfill-orders?dry=1", { method: "POST" });
      const dry = (await dryRes.json()) as { matched?: number; updated?: number; error?: string };
      if (!dryRes.ok) {
        setBackfillMessage(dry.error ?? "Preview failed.");
        return;
      }
      if (!dry.updated) {
        setBackfillMessage("Nothing to backfill: all orders already have exact figures.");
        return;
      }
      if (
        !window.confirm(
          `Backfill exact tax/total/refund figures from Lemon Squeezy onto ${dry.updated} orders?`,
        )
      ) {
        return;
      }
      const res = await fetch("/api/admin/finance/backfill-orders", { method: "POST" });
      const json = (await res.json()) as { updated?: number; error?: string };
      if (!res.ok) {
        setBackfillMessage(json.error ?? "Backfill failed.");
        return;
      }
      setBackfillMessage(`Backfilled ${json.updated ?? 0} orders.`);
      onSettingsChanged();
    } catch {
      setBackfillMessage("Network error.");
    } finally {
      setBackfillBusy(false);
    }
  };

  if (!settings) {
    return (
      <div className="mt-6">
        {error ? <p className="text-sm text-rose-600">{error}</p> : <p className="text-sm text-slate-500">Loading...</p>}
      </div>
    );
  }

  const num = (key: keyof Settings, label: string, hint?: string, step = "0.01") => (
    <label className="text-xs text-slate-600">
      {label}
      <input
        type="number"
        step={step}
        value={settings[key] as number}
        onChange={(e) => setSettings({ ...settings, [key]: Number(e.target.value) })}
        className="mt-1 block w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm"
      />
      {hint ? <span className="mt-0.5 block text-[10px] text-slate-400">{hint}</span> : null}
    </label>
  );

  return (
    <div className="mt-6 max-w-3xl space-y-6">
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Lemon Squeezy estimates</h2>
        <p className="mt-1 text-xs text-slate-500">
          LS has no payouts API, so fees and the payout schedule are estimates. Use the drift
          readout on the Payouts tab to tune these over time.
        </p>
        <div className="mt-3 flex flex-wrap gap-4">
          {num("lsFeePercent", "Fee %", "LS's cut of each sale")}
          {num("lsFeeFixedCents", "Fixed fee (cents)", "per order", "1")}
          {num("lsPayoutDayOfMonth", "Payout day of month", "1-28", "1")}
          {num("lsPayoutNetDelayDays", "Payout delay (days)", "order age to be included", "1")}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Revenue recognition</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          {num("refundHoldDays", "Refund hold (days)", "earned money stays held this long", "1")}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Tax planning</h2>
        <p className="mt-1 text-xs text-slate-500">
          Not sure about the S-corp election? Keep pass-through and confirm with a CPA; every rate
          here is adjustable.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-4">
          <label className="text-xs text-slate-600">
            Entity mode
            <select
              value={settings.taxMode}
              onChange={(e) =>
                setSettings({ ...settings, taxMode: e.target.value as Settings["taxMode"] })
              }
              className="mt-1 block rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="passthrough">Pass-through (sole proprietor LLC)</option>
              <option value="scorp">S-corp election</option>
            </select>
          </label>
          {settings.taxMode === "passthrough" ? (
            <>
              {num("federalRatePercent", "Federal rate %", "effective, on profit")}
              {num("seTaxRatePercent", "SE tax rate %")}
              {num("seTaxBasePercent", "SE tax base %", "IRS uses 92.35")}
            </>
          ) : (
            num("scorpDistributionRatePercent", "Distribution rate %", "federal, on distributions")
          )}
          {num("utahRatePercent", "Utah rate %")}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Affiliate payouts</h2>
        <div className="mt-3 flex flex-wrap gap-4">
          {num(
            "paypalSenderFeePerPayoutCents",
            "PayPal sender fee (cents)",
            "added per payout as expense; 0 if recipient covers fees",
            "1",
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        {saved ? <span className="text-sm text-emerald-600">Saved.</span> : null}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Order data backfill</h2>
        <p className="mt-1 text-xs text-slate-500">
          Pulls exact subtotal / tax / refund figures from Lemon Squeezy for orders created before
          the finance tracking existed. Run once after the migration; safe to re-run.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => void runBackfill()}
            disabled={backfillBusy}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {backfillBusy ? "Running..." : "Backfill from Lemon Squeezy"}
          </button>
          {backfillMessage ? <p className="text-xs text-slate-600">{backfillMessage}</p> : null}
        </div>
      </div>
    </div>
  );
}
