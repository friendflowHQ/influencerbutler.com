"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import { formatUsdFromCents } from "@/lib/affiliates";

/**
 * Extra dashboard panels for affiliates:
 *  - EarningsTrend: 30-day sparkline + change vs the prior 30 days (hero).
 *  - PayoutHistory: own payout ledger, CSV download, tax-year totals.
 *  - NextBestAction: one suggested next step based on clicks and the funnel.
 *  - QrCard: scannable QR code for the share link.
 */

export type DailyEarning = { date: string; earningsCents: number };

/* ------------------------------ Earnings trend ----------------------------- */

export function EarningsTrend({ daily }: { daily: DailyEarning[] }) {
  const { last, deltaPct, total } = useMemo(() => {
    const last = daily.slice(-30);
    const prior = daily.slice(-60, -30);
    const total = last.reduce((s, d) => s + d.earningsCents, 0);
    const priorTotal = prior.reduce((s, d) => s + d.earningsCents, 0);
    const deltaPct =
      priorTotal > 0 ? Math.round(((total - priorTotal) / priorTotal) * 100) : null;
    return { last, deltaPct, total };
  }, [daily]);

  if (last.length === 0 || total === 0) {
    return (
      <p className="text-sm text-slate-600">
        Your earnings trend appears here after your first referred order.
      </p>
    );
  }

  const W = 240;
  const H = 70;
  const max = Math.max(1, ...last.map((d) => d.earningsCents));
  const step = last.length > 1 ? (W - 8) / (last.length - 1) : 0;
  const pts = last.map((d, i) => `${4 + step * i},${H - 6 - (d.earningsCents / max) * (H - 14)}`);
  const lastPt = pts[pts.length - 1].split(",");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs text-slate-600">Last 30 days: {formatUsdFromCents(total)}</p>
        {deltaPct !== null ? (
          <p className={`text-xs font-medium ${deltaPct >= 0 ? "text-emerald-700" : "text-slate-600"}`}>
            {deltaPct >= 0 ? "+" : ""}
            {deltaPct}% vs prior 30
          </p>
        ) : null}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="mt-1 h-[70px] w-full"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Commission earned over the last 30 days: ${formatUsdFromCents(total)} in total${
          deltaPct !== null ? `, ${deltaPct >= 0 ? "up" : "down"} ${Math.abs(deltaPct)} percent on the prior 30 days` : ""
        }`}
      >
        <polyline
          fill="none"
          stroke="#c2410c"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={pts.join(" ")}
        />
        <circle cx={lastPt[0]} cy={lastPt[1]} r={3.5} fill="#c2410c" />
      </svg>
    </div>
  );
}

/* ------------------------------ Payout history ----------------------------- */

type PayoutRow = {
  id: string;
  period: string | null;
  amountCents: number;
  currency: string;
  status: string;
  paypalEmail: string | null;
  createdAt: string | null;
  paidAt: string | null;
};

function statusLabel(status: string): { text: string; tone: string } {
  switch (status) {
    case "success":
      return { text: "Paid", tone: "bg-emerald-50 text-emerald-800 ring-emerald-200" };
    case "pending":
    case "processing":
      return { text: "Processing", tone: "bg-amber-50 text-amber-800 ring-amber-200" };
    default:
      return { text: "Needs attention", tone: "bg-slate-100 text-slate-700 ring-slate-300" };
  }
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function PayoutHistory() {
  const [rows, setRows] = useState<PayoutRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/affiliates/payout-history", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setError(`Failed to load (${res.status})`);
          return;
        }
        const json = (await res.json()) as { payouts: PayoutRow[] };
        if (!cancelled) setRows(json.payouts ?? []);
      } catch (err) {
        console.error("payout-history fetch failed", err);
        if (!cancelled) setError("Network error.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const yearTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.status !== "success") continue;
      const y = (r.paidAt ?? r.createdAt ?? "").slice(0, 4);
      if (!y) continue;
      totals.set(y, (totals.get(y) ?? 0) + r.amountCents);
    }
    return [...totals.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [rows]);

  const downloadCsv = () => {
    if (!rows) return;
    const head = ["Date", "Period", "Amount (USD)", "Status", "PayPal email"];
    const lines = rows.map((r) =>
      [
        (r.paidAt ?? r.createdAt ?? "").slice(0, 10),
        r.period ?? "",
        (r.amountCents / 100).toFixed(2),
        statusLabel(r.status).text,
        r.paypalEmail ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "influencer-butler-payouts.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-labelledby="aff-history-title"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="aff-history-title" className="text-sm font-semibold text-slate-900">
          Payout history
        </h2>
        {rows && rows.length > 0 ? (
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
          >
            Download CSV
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </p>
      ) : rows === null ? (
        <div className="mt-3 space-y-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-600">
          No payouts yet. Your first one is sent once you have $10 payable and your tax form and
          PayPal email are set up.
        </p>
      ) : (
        <>
          {yearTotals.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {yearTotals.map(([year, cents]) => (
                <li
                  key={year}
                  className="rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-700"
                >
                  <span className="font-semibold">{year}</span> paid: {formatUsdFromCents(cents)}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <caption className="sr-only">Your payouts, most recent first</caption>
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">Date</th>
                  <th scope="col" className="py-2 pr-3 font-semibold">Period</th>
                  <th scope="col" className="py-2 pr-3 text-right font-semibold">Amount</th>
                  <th scope="col" className="py-2 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const s = statusLabel(r.status);
                  return (
                    <tr key={r.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-3 text-slate-700">{shortDate(r.paidAt ?? r.createdAt)}</td>
                      <td className="py-2 pr-3 text-slate-600">{r.period ?? ""}</td>
                      <td className="py-2 pr-3 text-right font-medium text-slate-900">
                        {formatUsdFromCents(r.amountCents)}
                      </td>
                      <td className="py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.tone}`}
                        >
                          {s.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Amounts are gross commissions before PayPal fees. Your tax form details are used for
            year-end reporting where required.
          </p>
        </>
      )}
    </section>
  );
}

/* ------------------------------ Next best action --------------------------- */

type Action = {
  title: string;
  body: string;
  cta: { label: string; href?: string; tab?: string };
};

type ClickStats = { total: number };
type FunnelStats = { signups: number; trialsStarted: number; paid: number };

export function NextBestAction({
  clicksEndpoint = "/api/affiliates/clicks",
  onNavigate,
}: {
  clicksEndpoint?: string;
  onNavigate: (tab: string) => void;
}) {
  const [clicks, setClicks] = useState<ClickStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelStats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const now = new Date();
        const from = new Date(now.getTime() - 30 * 86_400_000).toISOString();
        const [c, f] = await Promise.all([
          fetch(clicksEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ from, to: now.toISOString() }),
            cache: "no-store",
          }),
          fetch("/api/affiliates/referred-signups", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (c.ok) setClicks((await c.json()) as ClickStats);
        if (f.ok) setFunnel(((await f.json()) as { funnel: FunnelStats }).funnel);
        if (!c.ok || !f.ok) setFailed(true);
      } catch (err) {
        console.warn("next-best-action fetch skipped", err);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [clicksEndpoint]);

  if (failed && (!clicks || !funnel)) {
    // Stats did not load, so fall back to a tip that is true for everyone.
    return (
      <section
        aria-labelledby="aff-next-title"
        className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-800">
            Suggested next step
          </p>
          <h2 id="aff-next-title" className="mt-0.5 text-sm font-semibold text-slate-900">
            Post your link somewhere new this week
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            We could not load your stats just now, but fresh exposure always helps. Grab post
            ideas in the planner.
          </p>
        </div>
        <Link
          href="/dashboard/affiliates/planner"
          className="inline-flex flex-none items-center rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700"
        >
          See post ideas
        </Link>
      </section>
    );
  }

  if (!clicks || !funnel) return null;

  const total = clicks.total;
  let action: Action;
  if (funnel.paid > 0) {
    action = {
      title: `${funnel.paid} ${funnel.paid === 1 ? "referral is" : "referrals are"} paying you`,
      body: "Keep the momentum: a fresh post in the next few days is the easiest way to add another.",
      cta: { label: "Plan your next post", href: "/dashboard/affiliates/planner" },
    };
  } else if (funnel.trialsStarted > 0) {
    action = {
      title: "Trials are running from your link",
      body: "Most trials convert in the first week. Tell your audience what you use Influencer Butler for so they stick with it.",
      cta: { label: "Open the playbook", href: "/dashboard/affiliates/playbook" },
    };
  } else if (funnel.signups > 0) {
    action = {
      title: "You have signups but no trials yet",
      body: "Mention the free trial in your next post and show one result it gave you. That nudges signups into a trial.",
      cta: { label: "See post ideas", href: "/dashboard/affiliates/planner" },
    };
  } else if (total >= 10) {
    action = {
      title: `${total} clicks, no signups yet`,
      body: "People are clicking but not signing up. Try a per-channel link to see which post works, and lead with one specific benefit.",
      cta: { label: "Get channel links", tab: "promote" },
    };
  } else if (total > 0) {
    action = {
      title: "Your link is getting its first clicks",
      body: "Post it again in a different place this week. Repeat exposure is what turns first clicks into signups.",
      cta: { label: "Share it again", tab: "promote" },
    };
  } else {
    action = {
      title: "Get your first click",
      body: "Copy your link and post it once today: your bio, a story, or a reply on a post that is already getting traffic.",
      cta: { label: "Open the playbook", href: "/dashboard/affiliates/playbook" },
    };
  }

  const btn =
    "inline-flex flex-none items-center rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700";

  return (
    <section
      aria-labelledby="aff-next-title"
      className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-orange-800">
          Suggested next step
        </p>
        <h2 id="aff-next-title" className="mt-0.5 text-sm font-semibold text-slate-900">
          {action.title}
        </h2>
        <p className="mt-0.5 text-sm text-slate-600">{action.body}</p>
      </div>
      {action.cta.href ? (
        <Link href={action.cta.href} className={btn}>
          {action.cta.label}
        </Link>
      ) : (
        <button type="button" className={btn} onClick={() => onNavigate(action.cta.tab ?? "promote")}>
          {action.cta.label}
        </button>
      )}
    </section>
  );
}

/* ---------------------------------- QR code -------------------------------- */

function escapeHtml(v: string): string {
  return v.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

export function QrCard({ link, code }: { link: string; code?: string | null }) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 1200px PNG for print, generated on demand so the page stays light.
  const downloadPrintSize = async () => {
    setBusy(true);
    try {
      const big = await QRCode.toDataURL(link, { margin: 2, width: 1200, errorCorrectionLevel: "M" });
      const a = document.createElement("a");
      a.href = big;
      a.download = "influencer-butler-qr-print.png";
      a.click();
    } catch (err) {
      console.warn("qr print export failed", err);
    } finally {
      setBusy(false);
    }
  };

  // A one-page printable card (QR, code, short URL). Opens the browser print
  // dialog, which also offers "Save as PDF".
  const openPrintableCard = async () => {
    setBusy(true);
    try {
      const big = await QRCode.toDataURL(link, { margin: 2, width: 900, errorCorrectionLevel: "M" });
      const w = window.open("", "_blank", "width=800,height=1000");
      if (!w) return;
      w.document.write(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Influencer Butler card</title>` +
          `<style>body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:48px;color:#0f172a}` +
          `h1{font-size:32px;margin:0 0 8px}p{font-size:20px;margin:8px 0}img{width:420px;height:420px;margin:24px 0}` +
          `.code{display:inline-block;border:3px dashed #c2410c;border-radius:12px;padding:10px 24px;` +
          `font:700 36px monospace;letter-spacing:4px}</style></head><body>` +
          `<h1>Automation for creators</h1><p>Scan to try Influencer Butler</p>` +
          `<img src="${big}" alt="QR code for Influencer Butler">` +
          (code ? `<p>Or use my code for 15% off</p><div class="code">${escapeHtml(code)}</div>` : "") +
          `<p style="font-size:16px;color:#475569">influencerbutler.com</p>` +
          `<script>window.onload=function(){window.print()}<\/script></body></html>`,
      );
      w.document.close();
    } catch (err) {
      console.warn("qr card failed", err);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch((err) => console.warn("qr generation failed", err));
    return () => {
      cancelled = true;
    };
  }, [link]);

  return (
    <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          width={120}
          height={120}
          alt="QR code that opens your Influencer Butler share link"
          className="h-[120px] w-[120px] flex-none rounded-lg border border-slate-200"
        />
      ) : (
        <div className="h-[120px] w-[120px] flex-none animate-pulse rounded-lg bg-slate-100" />
      )}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900">Your link as a QR code</p>
        <p className="mt-1 text-sm text-slate-600">
          Handy for talks, print, packaging and video screens. Scanning it applies your code
          automatically.
        </p>
        {src ? (
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium">
            <a
              href={src}
              download="influencer-butler-qr.png"
              className="text-orange-700 hover:text-orange-800"
            >
              Download PNG
            </a>
            <button
              type="button"
              disabled={busy}
              onClick={downloadPrintSize}
              className="text-orange-700 hover:text-orange-800 disabled:opacity-60"
            >
              Download print size (1200 px)
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={openPrintableCard}
              className="text-orange-700 hover:text-orange-800 disabled:opacity-60"
            >
              Printable card / PDF
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
