"use client";

import { useEffect, useState } from "react";
import LinkBuilder from "./LinkBuilder";
import SocialShareButtons from "./SocialShareButtons";
import AffiliateClickAnalytics from "./AffiliateClickAnalytics";
import CompetitorPlaybook from "./CompetitorPlaybook";
import PlannerCallout from "./PlannerCallout";
import TaxFormCard from "./TaxFormCard";
import PayoutMethodCard from "./PayoutMethodCard";
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

type SelfHostedData = {
  brandedCode: string | null;
  createdAt: string | null;
  owedCents: number;
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
};

type Props = {
  displayName: string;
  /** Data source for the main payload. Defaults to the caller's own dashboard;
   *  the admin "view as" page points these at affiliate-scoped admin endpoints
   *  and sets readOnly to hide the tax/payout editors. */
  dataUrl?: string;
  clicksUrl?: string;
  readOnly?: boolean;
};

function brandedShareLink(code: string): string {
  return `https://www.influencerbutler.com/dashboard/subscription?code=${encodeURIComponent(code)}`;
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
  readOnly = false,
}: Props) {
  const [data, setData] = useState<SelfHostedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Bump to re-fetch after a child (tax form / payout method) changes.
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

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
      <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-800">
        {loadError}
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
  const taxReady = data.taxStatus === "verified";
  const payoutReady = Boolean(data.paypalEmail);
  const readyToBePaid = taxReady && payoutReady;

  return (
    <div className="space-y-6">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f97316]">
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

      {!readyToBePaid ? (
        <section className="rounded-2xl border border-[#f97316]/30 bg-gradient-to-br from-orange-50 via-white to-white p-4 sm:p-5 shadow-sm">
          <p className="text-sm font-semibold text-slate-900">Two steps to get paid</p>
          <p className="mt-1 text-sm text-slate-600">
            You can share your link and start earning right now. Complete these before your first
            payout so we can send your money:
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            <li className={taxReady ? "text-emerald-700" : "text-slate-700"}>
              {taxReady ? "✓" : "○"} Tax form (W-9 / W-8BEN)
            </li>
            <li className={payoutReady ? "text-emerald-700" : "text-slate-700"}>
              {payoutReady ? "✓" : "○"} PayPal payout email
            </li>
          </ul>
        </section>
      ) : null}

      {readOnly ? (
        <ReadOnlyPayoutTaxPanel
          paypalEmail={data.paypalEmail}
          taxStatus={data.taxStatus}
          taxFormType={data.taxFormType}
          taxForm={data.taxForm ?? null}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <TaxFormCard onChange={reload} />
          <PayoutMethodCard initialEmail={data.paypalEmail} onChange={reload} />
        </div>
      )}

      {code ? (
        <BrandedCodeCard
          code={code}
          shareLink={brandedShareLink(code)}
          durationMonths={data.durationMonths}
        />
      ) : null}

      {code ? <LinkBuilder code={code} /> : null}

      <AffiliateClickAnalytics endpoint={clicksUrl} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unpaid earnings" value={formatUsdFromCents(data.owedCents)} hint="Paid monthly via PayPal" />
        <StatCard label="Paid to date" value={formatUsdFromCents(data.paidCents)} hint="Successful payouts" />
        <StatCard label="Referred orders" value={data.orderCount.toString()} hint="Tracked to your link/code" />
        <StatCard
          label="Commission rate"
          value={`${data.ratePercent}%`}
          hint={data.durationMonths === null ? "Recurring, lifetime" : `Recurring for ${data.durationMonths} months`}
        />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <InfoRow label="Cookie window" value="30 days" hint="Last-click attribution" />
        <InfoRow
          label="Payout method"
          value={data.paypalEmail ? "PayPal" : "Not set"}
          hint={data.paypalEmail ?? (readOnly ? "No PayPal email on file yet" : "Add your PayPal email above")}
        />
      </section>

      {code ? (
        <SocialShareButtons
          link={brandedShareLink(code)}
          message={`Use my code ${code} for 15% off Influencer Butler - automation for creators and influencers that's actually worth it.`}
          label="Share in one click"
        />
      ) : null}

      <PlannerCallout />
      <CompetitorPlaybook />

      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
        Questions about a payout?{" "}
        <a href="mailto:hello@influencerbutler.com" className="font-medium text-[#f97316] hover:text-[#ea580c]">
          Contact our affiliate team
        </a>
        .
      </div>
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
    <section className="rounded-2xl border-2 border-[#f97316]/40 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-6 shadow-md">
      <p className="text-xs font-bold uppercase tracking-wider text-[#f97316]">
        ★ Your branded promo code
      </p>
      <p className="mt-1 text-sm text-slate-700">
        Share this code for <strong>15% off</strong> your audience&apos;s first month. You earn
        <strong> recurring commission for {durationPhrase(durationMonths)}</strong> per referred
        customer.
      </p>

      <div className="mt-4 flex items-center gap-3 rounded-lg border-2 border-[#f97316]/50 bg-white px-4 py-3 shadow-sm">
        <span className="font-mono text-2xl font-bold tracking-widest text-slate-900">{code}</span>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="ml-auto rounded-md bg-[#f97316] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
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
            value={shareLink}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20"
          />
          <button
            type="button"
            onClick={() => copy(shareLink, "link")}
            className="rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
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

// Read-only replacement for the editable TaxFormCard + PayoutMethodCard, used by
// the admin "view as affiliate" page. Shows the affiliate's tax + payout status
// (and full tax details when the admin endpoint included them) with no editors.
function ReadOnlyPayoutTaxPanel({
  paypalEmail,
  taxStatus,
  taxFormType,
  taxForm,
}: {
  paypalEmail: string | null;
  taxStatus: string;
  taxFormType: string | null;
  taxForm: TaxFormDetails | null;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
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

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Payout method</p>
        <p className="mt-2 text-base font-semibold text-slate-900">{paypalEmail ? "PayPal" : "Not set"}</p>
        <p className="mt-1 text-sm text-slate-600">{paypalEmail ?? "No PayPal email on file yet."}</p>
      </section>
    </div>
  );
}
