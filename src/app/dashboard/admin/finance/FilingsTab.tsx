"use client";

// 1099s tab: year-end filing workspace. US affiliate table with filing status,
// provider + IRIS CSV exports (bulk TIN decrypt, confirmed), a foreign-affiliate
// records section, a nudge list for missing forms, and an IRIS filing guide.

import { useCallback, useEffect, useState } from "react";
import { usd, shortDate } from "./format";

type FilingRow = {
  status: "draft" | "exported" | "filed" | "corrected" | "exempt";
  method: string | null;
  amountCents: number | null;
  filedAt: string | null;
  note: string | null;
};

type Payee = {
  userId: string;
  name: string | null;
  email: string | null;
  legalName: string | null;
  businessName: string | null;
  totalCents: number;
  payoutCount: number;
  country: string | null;
  formType: string | null;
  formStatus: string | null;
  tinLast4: string | null;
  tinKind: string | null;
  reportable: boolean;
  exportEligible: boolean;
  exemptHint: boolean;
  needsCorrection: boolean;
  filing: FilingRow | null;
  treatyCountry: string | null;
  treatyRate: number | null;
  w8: { validThrough: string | null; expired: boolean | null; expiringSoon: boolean | null } | null;
};

type Response1099 = {
  ok?: boolean;
  error?: string;
  year?: number;
  thresholdCents?: number;
  us?: Payee[];
  foreign?: Payee[];
  attention?: Payee[];
  filingsMigrationPending?: boolean;
  payerReady?: boolean;
  payerName?: string;
  lastNudged?: Record<string, string>;
};

const FILING_STATES: FilingRow["status"][] = [
  "draft",
  "exported",
  "filed",
  "corrected",
  "exempt",
];

export default function FilingsTab() {
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(currentYear - 1);
  const [data, setData] = useState<Response1099 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showUnder, setShowUnder] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/finance/filings?year=${year}`, { cache: "no-store" });
      const json = (await res.json()) as Response1099;
      if (!res.ok) {
        setError(json.error ?? `Failed (${res.status})`);
        return;
      }
      setData(json);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const setFiling = async (
    p: Payee,
    patch: { status?: FilingRow["status"]; method?: string; note?: string },
  ) => {
    await fetch("/api/admin/finance/filings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: p.userId,
        taxYear: year,
        status: patch.status ?? p.filing?.status ?? "draft",
        method: patch.method ?? p.filing?.method ?? null,
        note: patch.note ?? p.filing?.note ?? null,
      }),
    });
    await load();
  };

  const download = async (format: "provider" | "iris" | "foreign", count: number) => {
    if (format !== "foreign") {
      if (
        !window.confirm(
          `This decrypts ${count} full SSN/EIN value${count === 1 ? "" : "s"} into the downloaded file. The action is audited. Store the file securely and delete it once filed.`,
        )
      ) {
        return;
      }
    }
    setBusyMsg("Preparing export...");
    try {
      const res = await fetch(`/api/admin/finance/filings/export?year=${year}&format=${format}`, {
        cache: "no-store",
      });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || type.includes("application/json")) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? `Export failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = objUrl;
      a.download = `1099-${format}-${year}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objUrl);
      await load();
    } catch {
      setError("Network error during export.");
    } finally {
      setBusyMsg(null);
    }
  };

  const nudge = async (userIds?: string[]) => {
    setBusyMsg("Sending nudges...");
    try {
      const res = await fetch("/api/admin/finance/filings/nudge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, userIds }),
      });
      const json = (await res.json()) as { sent?: number; skipped?: number; error?: string };
      if (!res.ok) {
        setError(json.error ?? "Nudge failed.");
        return;
      }
      setBusyMsg(`Sent ${json.sent ?? 0}, skipped ${json.skipped ?? 0} (recently nudged).`);
      await load();
    } catch {
      setError("Network error.");
    }
  };

  const threshold = data?.thresholdCents ?? 60000;
  const us = data?.us ?? [];
  const reportableUs = us.filter((p) => p.reportable);
  const underThreshold = us.filter((p) => !p.reportable);
  const foreign = data?.foreign ?? [];
  const attention = data?.attention ?? [];
  const eligibleCount = reportableUs.filter((p) => p.exportEligible).length;

  const today = new Date().toISOString().slice(0, 10);
  const jan31 = `${year + 1}-01-31`;
  const showDeadline = today >= `${year + 1}-01-01` || today >= `${year}-12-01`;
  const pastDeadline = today > jan31;

  return (
    <div className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-600">
          1099-NEC for US affiliates paid {usd(threshold)}+ this year. Foreign affiliates (W-8BEN)
          are records-only. Planning workflow, not tax advice.
        </p>
        <label className="text-xs text-slate-600">
          Tax year{" "}
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {[currentYear, currentYear - 1, currentYear - 2, currentYear - 3].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {busyMsg ? <p className="text-sm text-slate-600">{busyMsg}</p> : null}
      {loading ? <p className="text-sm text-slate-500">Loading...</p> : null}

      {showDeadline ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            pastDeadline
              ? "border-rose-200 bg-rose-50 text-rose-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
          }`}
        >
          1099-NEC forms for {year} are due to the IRS and to each recipient by{" "}
          {shortDate(jan31)}.
          {pastDeadline ? " This deadline has passed." : ""}
        </div>
      ) : null}

      {data && !data.payerReady ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          Set your payer EIN (and confirm the payer name/address) in the Settings tab before
          exporting. Exports are blocked until the EIN is on file.
        </div>
      ) : null}

      {data?.filingsMigrationPending ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Filing status is not saved yet: apply supabase/migrations/20260828_finance_filings.sql to
          production. Exports and the numbers below still work.
        </div>
      ) : null}

      {/* US reportable table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            US affiliates over {usd(threshold)} ({reportableUs.length})
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={eligibleCount === 0}
              onClick={() => void download("provider", eligibleCount)}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Provider CSV ({eligibleCount})
            </button>
            <button
              type="button"
              disabled={eligibleCount === 0}
              onClick={() => void download("iris", eligibleCount)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              IRIS CSV ({eligibleCount})
            </button>
          </div>
        </div>
        {reportableUs.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">
            No US affiliates reached {usd(threshold)} in {year}.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Affiliate</th>
                  <th className="px-4 py-2">TIN</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">Form</th>
                  <th className="px-4 py-2">Filing</th>
                  <th className="px-4 py-2">Method</th>
                </tr>
              </thead>
              <tbody>
                {reportableUs.map((p) => (
                  <tr key={p.userId} className="border-t border-slate-100 align-top">
                    <td className="px-4 py-2">
                      <div className="font-medium text-slate-900">
                        {p.legalName ?? p.name ?? p.email ?? p.userId.slice(0, 8)}
                      </div>
                      {p.businessName ? (
                        <div className="text-xs text-slate-400">{p.businessName}</div>
                      ) : null}
                      {p.needsCorrection ? (
                        <span className="mt-0.5 inline-block rounded-full bg-rose-100 px-2 py-0.5 text-[10px] text-rose-700">
                          Total changed since filing: file a correction
                        </span>
                      ) : null}
                      {p.exemptHint ? (
                        <span className="mt-0.5 ml-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          Looks like a corporation (often exempt)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {p.tinLast4 ? `****${p.tinLast4}` : "-"}
                      <span className="ml-1 text-xs text-slate-400">
                        {p.tinKind ? p.tinKind.toUpperCase() : ""}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-medium text-slate-900">{usd(p.totalCents)}</td>
                    <td className="px-4 py-2">
                      {p.formStatus === "verified" ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">
                          {p.formType ?? "verified"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-700">
                          {p.formStatus ?? "no form"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={p.filing?.status ?? "draft"}
                        disabled={data?.filingsMigrationPending}
                        onChange={(e) =>
                          void setFiling(p, { status: e.target.value as FilingRow["status"] })
                        }
                        className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs"
                      >
                        {FILING_STATES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={p.filing?.method ?? ""}
                        disabled={data?.filingsMigrationPending}
                        onChange={(e) => void setFiling(p, { method: e.target.value })}
                        className="rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs"
                      >
                        <option value="">-</option>
                        <option value="iris">IRIS</option>
                        <option value="provider">Provider</option>
                        <option value="mail">Mail</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {underThreshold.length > 0 ? (
          <div className="border-t border-slate-100 px-4 py-2">
            <button
              type="button"
              onClick={() => setShowUnder((v) => !v)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              {showUnder ? "Hide" : "Show"} {underThreshold.length} US affiliate
              {underThreshold.length === 1 ? "" : "s"} under {usd(threshold)} (no 1099 required)
            </button>
            {showUnder ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-500">
                {underThreshold.map((p) => (
                  <li key={p.userId}>
                    {p.legalName ?? p.name ?? p.userId.slice(0, 8)}: {usd(p.totalCents)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Attention: reportable but missing/unverified forms */}
      {attention.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-amber-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-amber-900">
              Needs a tax form before filing ({attention.length})
            </h2>
            <button
              type="button"
              onClick={() => void nudge()}
              className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
            >
              Nudge all
            </button>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {attention.map((p) => (
                <tr key={p.userId} className="border-t border-slate-50">
                  <td className="px-4 py-2 text-slate-900">
                    {p.name ?? p.legalName ?? p.email ?? p.userId.slice(0, 8)}
                    <span className="ml-2 text-xs text-slate-400">
                      {p.formStatus ?? "no form"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{usd(p.totalCents)}</td>
                  <td className="px-4 py-2 text-right text-xs text-slate-400">
                    {data?.lastNudged?.[p.userId]
                      ? `nudged ${shortDate(data.lastNudged[p.userId])}`
                      : ""}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {p.email ? (
                      <button
                        type="button"
                        onClick={() => void nudge([p.userId])}
                        className="text-xs text-amber-700 hover:underline"
                      >
                        Nudge
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">no email</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Foreign records */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">
            Foreign affiliates ({foreign.length})
          </h2>
          {foreign.length > 0 ? (
            <button
              type="button"
              onClick={() => void download("foreign", foreign.length)}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Records CSV
            </button>
          ) : null}
        </div>
        <p className="px-4 pt-3 text-xs text-slate-500">
          No 1099 is required for foreign persons performing services entirely outside the US
          (foreign-source income). Keep the W-8BEN on file and re-collect before it expires (valid
          through Dec 31 of the third year after signing).
        </p>
        {foreign.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full min-w-[680px] text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-2">Affiliate</th>
                  <th className="px-4 py-2">Country</th>
                  <th className="px-4 py-2">Amount</th>
                  <th className="px-4 py-2">W-8BEN valid through</th>
                  <th className="px-4 py-2">Treaty</th>
                </tr>
              </thead>
              <tbody>
                {foreign.map((p) => (
                  <tr key={p.userId} className="border-t border-slate-100">
                    <td className="px-4 py-2 text-slate-900">
                      {p.legalName ?? p.name ?? p.userId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{p.country ?? "-"}</td>
                    <td className="px-4 py-2 font-medium text-slate-900">{usd(p.totalCents)}</td>
                    <td className="px-4 py-2">
                      {p.w8?.validThrough ? (
                        <span
                          className={
                            p.w8.expired
                              ? "text-rose-700"
                              : p.w8.expiringSoon
                                ? "text-amber-700"
                                : "text-slate-600"
                          }
                        >
                          {shortDate(p.w8.validThrough)}
                          {p.w8.expired ? " (expired)" : p.w8.expiringSoon ? " (soon)" : ""}
                        </span>
                      ) : (
                        <span className="text-slate-400">unknown</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {p.treatyCountry ?? "-"}
                      {p.treatyRate != null ? ` (${p.treatyRate}%)` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-4 text-sm text-slate-500">None paid this year.</p>
        )}
      </div>

      {/* IRIS filing guide */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShowGuide((v) => !v)}
          className="text-sm font-semibold text-slate-900"
        >
          {showGuide ? "Hide" : "Show"}: File free directly with the IRS (IRIS)
        </button>
        {showGuide ? (
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
            <li>
              Apply for an IRIS Transmitter Control Code (TCC) via the IRS &quot;IR Application for
              TCC&quot; (needs an ID.me account). Approval can take up to 45 days, so apply in the
              fall, well before January.
            </li>
            <li>
              Once approved, sign in to the IRIS Taxpayer Portal and add{" "}
              {data?.payerName ?? "your business"} as the issuer using the EIN from the Settings tab.
            </li>
            <li>
              Start a new 1099-NEC batch for the tax year and upload the IRIS CSV exported here.
              Download the IRS&apos;s current-year template first and confirm the columns match: the
              template can change each year.
            </li>
            <li>Fix any row errors the portal reports, submit, and save the receipt ID.</li>
            <li>
              IRIS does NOT send recipient copies. Mail each affiliate their Copy B by{" "}
              {shortDate(jan31)} (or deliver electronically with their consent).
            </li>
            <li>Mark each row here as filed (IRIS).</li>
          </ol>
        ) : null}
        <p className="mt-3 text-xs text-slate-400">
          The e-file mandate applies at 10+ information returns in aggregate. Direct API
          (A2A) auto-submit is future work once a TCC exists. Alternative: Track1099 or Tax1099
          import the Provider CSV, e-file with the IRS, and mail/e-deliver recipient copies for a
          small per-form fee.
        </p>
      </div>
    </div>
  );
}
