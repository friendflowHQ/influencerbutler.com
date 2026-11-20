"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import LinkBuilder from "./LinkBuilder";
import SocialShareButtons from "./SocialShareButtons";
import AffiliateClickAnalytics from "./AffiliateClickAnalytics";
import ReferredSignupsFunnel from "./ReferredSignupsFunnel";
import TaxFormCard from "./TaxFormCard";
import PayoutMethodCard from "./PayoutMethodCard";
import CompProspectCard from "./CompProspectCard";
import ConversionGoal from "./ConversionGoal";
import MediaKit from "./MediaKit";
import AffiliateHelp from "./AffiliateHelp";
import { copyToClipboard } from "./copy";
import {
  EarningsHero,
  GetPaidChecklist,
  PayoutPipeline,
  jumpTo,
} from "./AffiliateTopSection";
import {
  NextBestAction,
  PayoutHistory,
  QrCard,
  type DailyEarning,
} from "./AffiliateExtras";
import { formatUsdFromCents } from "@/lib/affiliates";

/**
 * Self-hosted affiliate dashboard. Sources everything from our own tables via
 * /api/affiliates/me-selfhosted (no Lemon Squeezy). Shows a "get paid" checklist
 * (tax form + PayPal), the branded code + link tools, click analytics, and
 * owed / paid stats from the commission engine + payout ledger.
 */

type TaxFormDetails = {
  legalName: string | null;
  country: string | null;
  tinLast4: string | null;
  tinKind: string | null;
  formType: string | null;
  status: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectedReason: string | null;
};

type Adjustment = { amountCents: number; note: string | null; createdAt: string | null };

type SelfHostedData = {
  brandedCode: string | null;
  createdAt: string | null;
  owedCents: number;
  adjustmentCents?: number;
  adjustments?: Adjustment[];
  // Refund/chargeback-safety split of the outstanding owed. Optional so an older
  // cached payload without them still renders.
  payableCents?: number;
  clearingCents?: number;
  upcomingCents?: number;
  // Projected payable balance at the next auto-pay run, and when that run is.
  payableAtNextRunCents?: number;
  nextPayoutAt?: string;
  // Payouts above this are held for a quick manual review before release.
  reviewCapCents?: number;
  // False while auto-pay runs in shadow mode (team releases payouts by hand).
  autopayArmed?: boolean;
  // Commission earned per UTC day, last 60 days, oldest first.
  dailyEarnings?: DailyEarning[];
  grossCents: number;
  orderCount: number;
  ratePercent: number;
  // null = lifetime (custom deals); a number = the honored window in months.
  durationMonths: number | null;
  paidCents: number;
  paypalEmail: string | null;
  taxStatus: "not_submitted" | "submitted" | "verified" | "rejected";
  taxFormType: string | null;
  // Present only in the admin "view as" payload.
  displayName?: string | null;
  taxForm?: TaxFormDetails | null;
  canEditPayout?: boolean;
  // Comp allowance gate: whether this affiliate may hand out free workspaces.
  comp?: { enabled: boolean } | null;
};

type Props = {
  displayName: string;
  /** Data source for the main payload. Defaults to the caller's own dashboard;
   *  the admin "view as" page points these at affiliate-scoped admin endpoints
   *  and sets readOnly to hide the tax/payout editors. */
  dataUrl?: string;
  clicksUrl?: string;
  /** Referred-signups funnel source. Defaults to the caller's own endpoint;
   *  the admin "view as" page points this at the affiliate-scoped admin
   *  endpoint so the panel shows there too. */
  referredSignupsUrl?: string;
  readOnly?: boolean;
  /** When set (admin view) AND the payload's canEditPayout is true, the payout
   *  card stays editable and saves the affiliate's PayPal email here. */
  payoutSaveUrl?: string;
};

function brandedShareLink(code: string): string {
  // Land prospects on the homepage so the link reads as a clean brand URL (no
  // "/pricing"). The static homepage captures ?code= via /js/affiliate-touch.js,
  // setting the ib_aff_src cookie so the affiliate's discount + attribution
  // still resolve at checkout. See src/app/api/checkout/route.ts.
  return `https://www.influencerbutler.com/?code=${encodeURIComponent(code)}`;
}

// "the first 12 months" for a capped window, or "the life of the subscription"
// for a lifetime (custom) deal like Samantha's.
function durationPhrase(durationMonths: number | null): string {
  return durationMonths === null
    ? "the life of the subscription"
    : `the first ${durationMonths} months`;
}

export default function SelfHostedAffiliateDashboard({
  displayName,
  dataUrl = "/api/affiliates/me-selfhosted",
  clicksUrl = "/api/affiliates/clicks",
  referredSignupsUrl,
  readOnly = false,
  payoutSaveUrl,
}: Props) {
  const [data, setData] = useState<SelfHostedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bump to re-fetch after a child (tax form / payout method) changes.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);
  const [tab, setTabState] = useState<TabId>(() => tabFromHash());
  const setTab = (next: TabId) => {
    setTabState(next);
    try {
      window.history.replaceState(null, "", `#${next}`);
    } catch {
      /* non-critical */
    }
  };
  // Sidebar links like #guest-passes or #leaderboard: open the right tab, then
  // scroll to the section once it is on screen.
  const goToHash = () => {
    const h = window.location.hash.replace("#", "");
    if (h === "guest-passes") setTabState("promote");
    else if (TABS.some((t) => t.id === h)) setTabState(h as TabId);
    else if (h !== "leaderboard") return;
    window.setTimeout(() => {
      document.getElementById(h)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  };
  useEffect(() => {
    window.addEventListener("hashchange", goToHash);
    return () => window.removeEventListener("hashchange", goToHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hasData = data !== null;
  useEffect(() => {
    if (hasData) goToHash();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasData]);

  // "Add now" in the checklist lives on the Get paid tab: switch, then scroll.
  const jumpToCard = (id: string) => {
    setTab("paid");
    window.setTimeout(() => jumpTo(id), 60);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setLoadError(`Failed to load (${res.status})`);
          return;
        }
        const json = (await res.json()) as SelfHostedData;
        if (!cancelled) setData(json);
      } catch (err) {
        console.error("me-selfhosted load failed", err);
        if (!cancelled) setLoadError("Network error. Please refresh to try again.");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, dataUrl]);

  if (loadError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800"
      >
        <span>{loadError}</span>
        <button
          type="button"
          onClick={() => {
            setLoadError(null);
            reload();
          }}
          className="rounded-lg bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-800"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-slate-200" />
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </div>
    );
  }

  const code = data.brandedCode;
  const payoutReady = Boolean(data.paypalEmail);

  const heroPayableNext = data.payableAtNextRunCents ?? data.payableCents ?? 0;
  const reviewCap = data.reviewCapCents ?? null;
  const armed = data.autopayArmed ?? null;
  const showPerformance = !readOnly || Boolean(referredSignupsUrl);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
          Affiliate dashboard
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
          Welcome back, {data.displayName ?? displayName}.
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          You earn {data.ratePercent}% recurring for {durationPhrase(data.durationMonths)} of every
          subscription you refer. Share your link, and we pay you directly.
        </p>
      </header>

      <EarningsHero
        unpaidCents={data.owedCents + (data.adjustmentCents ?? 0)}
        payableAtNextRunCents={heroPayableNext}
        nextPayoutAt={data.nextPayoutAt ?? null}
        reviewCapCents={reviewCap}
        autopayArmed={armed}
        dailyEarnings={data.dailyEarnings ?? []}
        shareLink={code && !readOnly ? brandedShareLink(code) : null}
        code={code && !readOnly ? code : null}
      />

      <GetPaidChecklist
        taxStatus={data.taxStatus}
        payoutReady={payoutReady}
        readOnly={readOnly}
        onJump={jumpToCard}
        unpaidCents={data.owedCents + (data.adjustmentCents ?? 0)}
      />

      <TabBar tab={tab} onChange={setTab} showPerformance={showPerformance} />

      <TabPanel id="overview" tab={tab}>
        <PayoutPipeline
          upcomingCents={data.upcomingCents ?? 0}
          clearingCents={data.clearingCents ?? 0}
          payableCents={data.payableCents ?? 0}
          payableAtNextRunCents={heroPayableNext}
          nextPayoutAt={data.nextPayoutAt ?? null}
          reviewCapCents={reviewCap}
          autopayArmed={armed}
          paidCents={data.paidCents}
        />

        {!readOnly ? <NextBestAction onNavigate={(t) => setTab(t as TabId)} /> : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <StatCard label="Referred orders" value={data.orderCount.toString()} hint="Tracked to your link/code" />
          <StatCard
            label="Commission rate"
            value={`${data.ratePercent}%`}
            hint={data.durationMonths === null ? "Recurring, lifetime" : `Recurring for ${data.durationMonths} months`}
          />
        </section>

        {data.adjustments && data.adjustments.length > 0 ? (
          <section className="rounded-xl border border-orange-200 bg-orange-50 p-4 sm:p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-orange-800">
              Adjustments included in your unpaid earnings
            </h2>
            <ul className="mt-3 space-y-2">
              {data.adjustments.map((a, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-orange-200 bg-white p-3 text-sm">
                  <span className="text-slate-700">{a.note || "Commission adjustment"}</span>
                  <span className="font-semibold text-slate-900">{formatUsdFromCents(a.amountCents)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <InfoRow label="Cookie window" value="30 days" hint="Last-click attribution" />
          <InfoRow
            label="Payout schedule"
            value="Monthly"
            hint="On or around the 1st, via PayPal"
            detail="We pay monthly via PayPal, on or around the 1st. Each order's commission is held for 14 days first (a short buffer so refunds and disputes settle), then paid in the next run once your balance is at least $10. Example: an order on Jul 10 clears Jul 24 and is paid Aug 1; an order on Jul 25 clears Aug 8 and is paid Sep 1."
          />
          <InfoRow
            label="Minimum payout"
            value="$10"
            hint="Balances under $10 roll over to the next month"
            detail="You need at least $10 in unpaid earnings to be paid out. Anything under $10 stays on your balance and rolls into the next monthly run."
          />
          <InfoRow
            label="Payout method"
            value={data.paypalEmail ? "PayPal" : "Not set"}
            hint={data.paypalEmail ?? (readOnly ? "No PayPal email on file yet" : "Add your PayPal email in Get paid")}
          />
        </section>
      </TabPanel>

      <TabPanel id="promote" tab={tab}>
        {code ? (
          <BrandedCodeCard
            code={code}
            shareLink={brandedShareLink(code)}
            durationMonths={data.durationMonths}
          />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
            Your branded code appears here once it is generated.
          </p>
        )}
        {code ? <QrCard link={brandedShareLink(code)} code={code} /> : null}
        {code ? <LinkBuilder code={code} /> : null}
        {code ? (
          <SocialShareButtons
            link={brandedShareLink(code)}
            message={`Use my code ${code} for 15% off Influencer Butler - automation for creators and influencers that's actually worth it.`}
            label="Share in one click"
          />
        ) : null}
        {!readOnly ? (
          <div id="guest-passes" className="scroll-mt-24">
            {data.comp?.enabled ? <CompProspectCard /> : <GuestPassTeaser />}
          </div>
        ) : null}
        {!readOnly ? <MediaKit /> : null}
        {!readOnly ? (
          <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <span className="font-semibold text-slate-900">Need ideas?</span>
            <Link href="/dashboard/affiliates/playbook" className="font-medium text-orange-700 hover:text-orange-800">
              Open the playbook
            </Link>
            <Link href="/dashboard/affiliates/planner" className="font-medium text-orange-700 hover:text-orange-800">
              Plan your posts
            </Link>
          </section>
        ) : null}
      </TabPanel>

      {showPerformance ? (
        <TabPanel id="performance" tab={tab}>
          <ConversionGoal
            clicksEndpoint={clicksUrl}
            referredSignupsEndpoint={referredSignupsUrl ?? "/api/affiliates/referred-signups"}
          />
          <AffiliateClickAnalytics endpoint={clicksUrl} />
          {/* The affiliate's own dashboard uses the default endpoint; the admin
              "view as" page passes an affiliate-scoped admin endpoint so the
              panel shows there too (the default one would 403 for an admin). */}
          <ReferredSignupsFunnel
            endpoint={referredSignupsUrl ?? "/api/affiliates/referred-signups"}
          />
        </TabPanel>
      ) : null}

      <TabPanel id="paid" tab={tab}>
        {readOnly ? (
          <div className="space-y-2">
            <div className="grid gap-4 lg:grid-cols-2">
              <div id="aff-tax-card">
                <ReadOnlyTaxCard
                  taxStatus={data.taxStatus}
                  taxFormType={data.taxFormType}
                  taxForm={data.taxForm ?? null}
                />
              </div>
              <div id="aff-payout-card">
                {payoutSaveUrl && data.canEditPayout ? (
                  <PayoutMethodCard
                    initialEmail={data.paypalEmail}
                    endpoint={payoutSaveUrl}
                    onChange={reload}
                  />
                ) : (
                  <ReadOnlyPayoutCard paypalEmail={data.paypalEmail} />
                )}
              </div>
            </div>
            {payoutSaveUrl && data.canEditPayout ? (
              <p className="text-xs text-slate-500">
                You&apos;re setting this on the affiliate&apos;s behalf. They can also add or change
                their PayPal email themselves in their own dashboard.
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-2">
              <div id="aff-tax-card">
                <TaxFormCard onChange={reload} />
              </div>
              <div id="aff-payout-card">
                <PayoutMethodCard initialEmail={data.paypalEmail} onChange={reload} />
              </div>
            </div>
            <PayoutHistory />
          </>
        )}
      </TabPanel>

      {!readOnly ? (
        <AffiliateHelp />
      ) : null}
    </div>
  );
}

type TabId = "overview" | "promote" | "performance" | "paid";

const TABS: { id: TabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "promote", label: "Promote" },
  { id: "performance", label: "Performance" },
  { id: "paid", label: "Get paid" },
];

function tabFromHash(): TabId {
  if (typeof window === "undefined") return "overview";
  const h = window.location.hash.replace("#", "");
  return TABS.some((t) => t.id === h) ? (h as TabId) : "overview";
}

function TabBar({
  tab,
  onChange,
  showPerformance,
}: {
  tab: TabId;
  onChange: (t: TabId) => void;
  showPerformance: boolean;
}) {
  const tabs = TABS.filter((t) => showPerformance || t.id !== "performance");
  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    onChange(next.id);
    document.getElementById(`aff-tab-${next.id}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Affiliate dashboard sections"
      className="flex gap-1 overflow-x-auto border-b border-slate-200"
    >
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={`aff-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`aff-panel-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
          className={`-mb-px flex-none whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-orange-700 ${
            tab === t.id
              ? "border-orange-700 text-orange-700"
              : "border-transparent text-slate-600 hover:text-slate-900"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function TabPanel({
  id,
  tab,
  children,
}: {
  id: TabId;
  tab: TabId;
  children: React.ReactNode;
}) {
  return (
    <div
      role="tabpanel"
      id={`aff-panel-${id}`}
      aria-labelledby={`aff-tab-${id}`}
      hidden={tab !== id}
      className="space-y-6"
    >
      {children}
    </div>
  );
}

function BrandedCodeCard({
  code,
  shareLink,
  durationMonths,
}: {
  code: string;
  shareLink: string;
  durationMonths: number | null;
}) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copy = async (text: string, which: "code" | "link") => {
    if (!(await copyToClipboard(text))) return;
    if (which === "code") {
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2000);
    } else {
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  return (
    <section className="rounded-2xl border-2 border-[#f97316]/40 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-md">
      <p className="text-xs font-bold uppercase tracking-wider text-orange-700">
        ★ Your branded promo code
      </p>
      <p className="mt-1 text-sm text-slate-700">
        Share this code for <strong>15% off every month</strong>, for as long as they stay
        subscribed. You earn
        <strong> recurring commission for {durationPhrase(durationMonths)}</strong> per referred
        customer.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-lg border-2 border-[#f97316]/50 bg-white px-4 py-3 shadow-sm">
        <span className="font-mono text-2xl font-bold tracking-widest text-slate-900">{code}</span>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="ml-auto rounded-md bg-orange-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-orange-800"
        >
          {copiedCode ? "Copied!" : "Copy code"}
        </button>
      </div>

      <div className="mt-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Pre-filled share link (the code auto-applies at checkout)
        </p>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            readOnly
            aria-label="Your pre-filled share link"
            value={shareLink}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
          <button
            type="button"
            onClick={() => copy(shareLink, "link")}
            className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-800"
          >
            {copiedLink ? "Copied!" : "Copy link"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          When customers use this link the code auto-applies and you&apos;re credited. When they type
          just the code at checkout on our site, you&apos;re still credited.
        </p>
      </div>
    </section>
  );
}

/** Shown when an affiliate has no guest passes yet, so they learn it exists. */
function GuestPassTeaser() {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-orange-800">
          VIP
        </span>
        <h2 className="text-lg font-semibold text-slate-900">VIP Guest Passes</h2>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        Hand a warm prospect a free single-seat Pro workspace for a few weeks. It carries your
        referral link, so you earn commission if they upgrade. Passes are switched on per affiliate
        once you have a few referrals, and they are not on for your account yet.
      </p>
      <Link
        href="/contact?subject=Guest%20passes%20request"
        className="mt-3 inline-block text-sm font-semibold text-orange-700 hover:text-orange-800"
      >
        Ask the team to turn them on
      </Link>
    </section>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </article>
  );
}

function InfoRow({
  label,
  value,
  hint,
  detail,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Longer explanation, always visible (tooltips do not work on touch or keyboard). */
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
      {hint ? <p className="text-xs text-slate-600">{hint}</p> : null}
      {detail ? <p className="mt-2 text-xs text-slate-500">{detail}</p> : null}
    </div>
  );
}

function taxStatusLabel(status: string): string {
  switch (status) {
    case "verified":
      return "Verified";
    case "submitted":
      return "Submitted, pending review";
    case "rejected":
      return "Rejected";
    default:
      return "Not submitted";
  }
}

function fmtDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function DefRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{k}</dt>
      <dd className="text-right font-medium text-slate-800">{v}</dd>
    </div>
  );
}

// Read-only tax card for the admin "view as affiliate" page. Shows the tax
// status (and full details when the admin endpoint included them) with no editor.
function ReadOnlyTaxCard({
  taxStatus,
  taxFormType,
  taxForm,
}: {
  taxStatus: string;
  taxFormType: string | null;
  taxForm: TaxFormDetails | null;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Tax form</p>
      <p className="mt-2 flex items-center gap-2 text-base font-semibold text-slate-900">
        {taxStatusLabel(taxStatus)}
        {taxFormType ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {taxFormType}
          </span>
        ) : null}
      </p>
      {taxForm ? (
        <dl className="mt-3 space-y-1.5 text-sm">
          {taxForm.legalName ? <DefRow k="Legal name" v={taxForm.legalName} /> : null}
          {taxForm.country ? <DefRow k="Country" v={taxForm.country} /> : null}
          {taxForm.tinLast4 ? (
            <DefRow
              k="TIN"
              v={`•••• ${taxForm.tinLast4}${taxForm.tinKind ? ` (${taxForm.tinKind.toUpperCase()})` : ""}`}
            />
          ) : null}
          {taxForm.submittedAt ? <DefRow k="Submitted" v={fmtDate(taxForm.submittedAt)} /> : null}
          {taxForm.verifiedAt ? <DefRow k="Verified" v={fmtDate(taxForm.verifiedAt)} /> : null}
          {taxForm.rejectedReason ? <DefRow k="Rejected reason" v={taxForm.rejectedReason} /> : null}
        </dl>
      ) : taxStatus !== "not_submitted" ? (
        <p className="mt-2 text-xs text-slate-500">
          Full tax details are hidden (requires the tax-view permission).
        </p>
      ) : null}
    </section>
  );
}

// Read-only payout summary, shown in the admin view when the actor may not edit
// the affiliate's payout email (lacks the affiliates.payout permission).
function ReadOnlyPayoutCard({ paypalEmail }: { paypalEmail: string | null }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payout method</p>
      <p className="mt-2 text-base font-semibold text-slate-900">{paypalEmail ? "PayPal" : "Not set"}</p>
      <p className="mt-1 text-sm text-slate-600">{paypalEmail ?? "No PayPal email on file yet."}</p>
    </section>
  );
}
