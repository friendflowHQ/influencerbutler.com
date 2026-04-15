"use client";

import { useMemo, useState } from "react";
import ShareLinkCard from "@/app/affiliates/portal/ShareLinkCard";
import EarningsSparkline from "./EarningsSparkline";
import {
  formatUsdFromCents,
  buildShareLink,
  type AffiliateSummary,
  type AffiliateReferralStats,
} from "@/lib/affiliates";

type Props = {
  summary: AffiliateSummary;
  referrals: AffiliateReferralStats | null;
  lsAffiliateId: string;
  displayName: string;
  brandedCode?: string | null;
};

const MILESTONES: { label: string; threshold: number }[] = [
  { label: "First $100", threshold: 100_00 },
  { label: "$500 earned", threshold: 500_00 },
  { label: "$1K earned", threshold: 1_000_00 },
  { label: "$5K earned", threshold: 5_000_00 },
  { label: "$10K earned", threshold: 10_000_00 },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function estimateNextPayout(): string {
  // Lemon Squeezy pays monthly — approximate as the 1st of next month.
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(next);
}

export default function AffiliateDashboard({
  summary,
  referrals,
  lsAffiliateId,
  displayName,
  brandedCode,
}: Props) {
  const isActive = summary.status === "active";
  const shareLink = buildShareLink(summary.shareDomain, lsAffiliateId);
  const brandedShareLink = brandedCode
    ? `https://www.influencerbutler.com/dashboard/subscription?code=${encodeURIComponent(brandedCode)}`
    : null;

  const milestone = useMemo(() => {
    const earned = summary.totalEarningsCents;
    const next = MILESTONES.find((m) => earned < m.threshold);
    const prev = [...MILESTONES].reverse().find((m) => earned >= m.threshold);
    if (!next) {
      return {
        label: "All milestones cleared — legend status.",
        pct: 1,
        current: earned,
        target: earned,
      };
    }
    const base = prev?.threshold ?? 0;
    const pct = Math.max(0, Math.min(1, (earned - base) / (next.threshold - base)));
    return { label: `Next milestone: ${next.label}`, pct, current: earned, target: next.threshold };
  }, [summary.totalEarningsCents]);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
          Affiliate dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Welcome back, {displayName}.
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Your referral stats, powered by Lemon Squeezy. Updated{" "}
          {summary.updatedAt ? formatDate(summary.updatedAt) : "moments ago"}.
        </p>
      </header>

      {!isActive ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Your affiliate account is currently <strong>{summary.status}</strong>. Earnings tracking is
          paused until it&apos;s reactivated. Reach out to{" "}
          <a
            href="mailto:hello@influencerbutler.com"
            className="font-medium underline underline-offset-2"
          >
            hello@influencerbutler.com
          </a>
          .
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total earned"
          value={formatUsdFromCents(summary.totalEarningsCents)}
          hint="Lifetime commissions"
        />
        <StatCard
          label="Unpaid earnings"
          value={formatUsdFromCents(summary.unpaidEarningsCents)}
          hint={`Next payout ~ ${estimateNextPayout()}`}
        />
        <StatCard
          label="Referrals"
          value={referrals ? referrals.totalReferrals.toString() : "—"}
          hint={
            referrals
              ? `${referrals.activeReferrals} still active`
              : "Tracking syncing — check back soon"
          }
        />
        <StatCard
          label="Cancels"
          value={referrals ? referrals.cancelledReferrals.toString() : "—"}
          hint={
            referrals && referrals.totalReferrals > 0
              ? `${Math.round((referrals.cancelledReferrals / referrals.totalReferrals) * 100)}% churn`
              : "Lower is better"
          }
        />
      </section>

      {isActive && brandedCode && brandedShareLink ? (
        <BrandedCodeCard code={brandedCode} shareLink={brandedShareLink} />
      ) : null}

      {isActive ? <ShareLinkCard shareLink={shareLink} shareDomain={summary.shareDomain} /> : null}

      {referrals && referrals.dailyEarnings.length > 0 ? (
        <EarningsSparkline data={referrals.dailyEarnings} />
      ) : null}

      <section className="grid gap-4 lg:grid-cols-3">
        <MilestoneCard
          label={milestone.label}
          pct={milestone.pct}
          current={milestone.current}
          target={milestone.target}
        />
        <MotivationCard
          title="Active subscribers"
          value={referrals ? referrals.activeReferrals.toString() : "—"}
          body="Every active subscriber pays you 35% of their plan every month — forever."
        />
        <MotivationCard
          title="Conversion rate"
          value={
            referrals && referrals.conversionRate !== null
              ? `${(referrals.conversionRate * 100).toFixed(1)}%`
              : "—"
          }
          body={
            referrals && referrals.totalClicks !== null
              ? `${referrals.totalClicks.toLocaleString()} total clicks tracked.`
              : "We'll track clicks vs. signups here once Lemon Squeezy reports them."
          }
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <InfoRow label="Member since" value={formatDate(summary.createdAt)} />
        <InfoRow
          label="Commission rate"
          value="35% recurring"
          hint="For the life of every subscription"
        />
        <InfoRow label="Cookie window" value="30 days" hint="Last-click attribution" />
        <InfoRow label="Payout processor" value="Lemon Squeezy" hint="Paid monthly" />
      </section>

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Need help or want to see payout history?{" "}
        <a
          href="mailto:hello@influencerbutler.com"
          className="font-medium text-[#f97316] hover:text-[#ea580c]"
        >
          Contact our affiliate team
        </a>
        .
      </div>
    </div>
  );
}

function BrandedCodeCard({ code, shareLink }: { code: string; shareLink: string }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copy = async (text: string, which: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "code") {
        setCopiedCode(true);
        window.setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        window.setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch (error) {
      console.error("Clipboard copy failed", error);
    }
  };

  return (
    <section className="rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50 via-white to-white p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
        Your branded promo code
      </p>
      <p className="mt-1 text-sm text-slate-600">
        Share this code for <strong>15% off</strong> your audience&apos;s first month — you&apos;re
        credited 35% recurring commission when they check out from our site.
      </p>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-3 rounded-lg border border-indigo-300 bg-white px-4 py-3">
          <span className="font-mono text-xl font-bold tracking-widest text-indigo-900">
            {code}
          </span>
          <button
            type="button"
            onClick={() => copy(code, "code")}
            className="ml-auto text-xs font-medium text-indigo-700 hover:text-indigo-900"
          >
            {copiedCode ? "Copied!" : "Copy code"}
          </button>
        </div>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Pre-filled share link (easiest thing to post)
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            readOnly
            value={shareLink}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="button"
            onClick={() => copy(shareLink, "link")}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
          >
            {copiedLink ? "Copied!" : "Copy link"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          When customers use this link, the code is auto-applied and you&apos;re credited
          automatically. When they type just the code at checkout on our site, you&apos;re still
          credited.
        </p>
      </div>
    </section>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}

function InfoRow({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function MilestoneCard({
  label,
  pct,
  current,
  target,
}: {
  label: string;
  pct: number;
  current: number;
  target: number;
}) {
  const pctInt = Math.round(pct * 100);
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Milestone</p>
      <p className="mt-1 text-base font-semibold text-slate-900">{label}</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#f97316] transition-all"
          style={{ width: `${pctInt}%` }}
          aria-label={`Milestone progress ${pctInt}%`}
        />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {formatUsdFromCents(current)} of {formatUsdFromCents(target)} — keep going.
      </p>
    </article>
  );
}

function MotivationCard({ title, value, body }: { title: string; value: string; body: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{body}</p>
    </article>
  );
}
