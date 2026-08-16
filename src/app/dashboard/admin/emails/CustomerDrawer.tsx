"use client";

// Right-side drawer showing everything about one customer's email life:
// profile + tier, suppression state, lifecycle funnel progress, and every
// email sent to them. Sits at z-30 so a send opened from inside it stacks
// ON TOP (SendDrawer is z-40), mirroring the support page's drawer pair.

import { useEffect, useState } from "react";
import { getStatusBadge } from "@/lib/subscription-status";

type FunnelStep = { label: string; sentAt: string | null };

type FunnelProgress = {
  key: string;
  label: string;
  enteredAt: string | null;
  steps: FunnelStep[];
  convertedAt: string | null;
  statusLine: string;
};

type CustomerSendRow = {
  id: string;
  subject: string;
  category: string;
  funnel: string;
  status: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  created_at: string;
};

type CustomerResponse = {
  email: string;
  found: boolean;
  userId: string | null;
  displayName: string | null;
  isAffiliate: boolean;
  affiliateCode: string | null;
  tier: string;
  subscriptionStatus: string | null;
  planName: string | null;
  renewsAt: string | null;
  endsAt: string | null;
  suppressed: { reason: string | null; createdAt: string | null } | null;
  newsletter: {
    source: string | null;
    createdAt: string | null;
    confirmedAt: string | null;
    unsubscribedAt: string | null;
  } | null;
  funnels: FunnelProgress[];
  sends: CustomerSendRow[];
  sendTotals: { total: number; opened: number; clicked: number; bounced: number };
  comps: {
    discountCode: string | null;
    months: number | null;
    issuedAt: string | null;
    expiresAt: string | null;
    activatedAt: string | null;
    source: string | null;
  }[];
  referral: {
    asReferred: { status: string | null; friendCompIssuedAt: string | null } | null;
    referredCount: number;
    convertedCount: number;
  };
  migrationPending: boolean;
  error?: string;
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700",
  suppressed: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
};

const TIER_BADGE: Record<string, string> = {
  free: "bg-slate-100 text-slate-600",
  trial: "bg-sky-50 text-sky-700",
  pro: "bg-indigo-50 text-indigo-700",
};

function fmtDay(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtWhen(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CustomerDrawer({
  email,
  onClose,
  onOpenSend,
}: {
  email: string;
  onClose: () => void;
  onOpenSend: (id: string) => void;
}) {
  const [data, setData] = useState<CustomerResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setData(null);
      setError(null);
      try {
        const res = await fetch(`/api/admin/emails/customer?email=${encodeURIComponent(email)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as CustomerResponse;
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? `Failed (${res.status})`);
          return;
        }
        setData(json);
      } catch {
        if (!cancelled) setError("Network error. Please retry.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [email]);

  const badge = data?.subscriptionStatus ? getStatusBadge(data.subscriptionStatus) : null;

  return (
    <div className="fixed inset-0 z-30 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-slate-900">{email}</h2>
            {data ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {data.displayName ? (
                  <span className="text-sm text-slate-600">{data.displayName}</span>
                ) : null}
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${TIER_BADGE[data.tier] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {data.tier}
                </span>
                {badge ? (
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                ) : null}
                {data.isAffiliate ? (
                  <span className="inline-block rounded bg-orange-50 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                    affiliate{data.affiliateCode ? ` · ${data.affiliateCode}` : ""}
                  </span>
                ) : null}
                {data.suppressed ? (
                  <span className="inline-block rounded bg-rose-50 px-1.5 py-0.5 text-xs font-medium text-rose-700">
                    suppressed ({data.suppressed.reason ?? "unknown"})
                  </span>
                ) : null}
                {data.newsletter?.unsubscribedAt ? (
                  <span className="inline-block rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                    newsletter unsubscribed
                  </span>
                ) : null}
                {!data.found ? (
                  <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">
                    no account
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
        ) : null}
        {!data && !error ? (
          <div className="mt-6 h-32 animate-pulse rounded-lg bg-slate-100" />
        ) : null}

        {data ? (
          <>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <a
                href={`/dashboard/admin/users?q=${encodeURIComponent(email)}`}
                className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
              >
                Open in Users
              </a>
              {data.comps.length > 0 ? (
                <a
                  href={`/dashboard/admin/comps?q=${encodeURIComponent(email)}`}
                  className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                >
                  Comps
                </a>
              ) : null}
            </div>

            {data.migrationPending ? (
              <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                The email_sends table is missing, so the email history below is empty. Apply the
                20260816 migration.
              </div>
            ) : null}

            {data.planName || data.subscriptionStatus ? (
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div>
                  <dt className="text-slate-400">Plan</dt>
                  <dd className="text-slate-700">{data.planName ?? "-"}</dd>
                </div>
                <div>
                  <dt className="text-slate-400">{data.endsAt ? "Ends" : "Renews"}</dt>
                  <dd className="text-slate-700">{fmtDay(data.endsAt ?? data.renewsAt)}</dd>
                </div>
              </dl>
            ) : null}

            {/* Lifecycle funnels */}
            {data.funnels.length > 0 ? (
              <>
                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Lifecycle
                </h3>
                <div className="mt-2 space-y-4">
                  {data.funnels.map((f) => (
                    <div key={f.key} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-800">{f.label}</p>
                        <p className="text-xs text-slate-400">entered {fmtDay(f.enteredAt)}</p>
                      </div>
                      <p
                        className={`mt-1 text-xs ${f.convertedAt ? "font-medium text-emerald-600" : "text-slate-500"}`}
                      >
                        {f.statusLine}
                      </p>
                      <ol className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {f.steps.map((s) => (
                          <li key={s.label} className="flex items-center gap-1.5 text-xs">
                            <span
                              className={`h-2 w-2 rounded-full ${s.sentAt ? "bg-indigo-500" : "bg-slate-200"}`}
                            />
                            <span className={s.sentAt ? "text-slate-700" : "text-slate-400"}>
                              {s.label}
                            </span>
                            {s.sentAt ? (
                              <span className="text-slate-400">{fmtDay(s.sentAt)}</span>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {/* Comps + referrals */}
            {data.comps.length > 0 || data.referral.referredCount > 0 || data.referral.asReferred ? (
              <>
                <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Comps and referrals
                </h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  {data.comps.map((c, i) => (
                    <li key={`${c.discountCode ?? "comp"}-${i}`}>
                      Comp {c.discountCode ? <span className="font-mono text-xs">{c.discountCode}</span> : null}
                      {c.months ? ` (${c.months}mo)` : ""}, issued {fmtDay(c.issuedAt)}
                      {c.activatedAt ? `, activated ${fmtDay(c.activatedAt)}` : ", not activated"}
                      {c.expiresAt ? `, expires ${fmtDay(c.expiresAt)}` : ""}
                    </li>
                  ))}
                  {data.referral.referredCount > 0 ? (
                    <li>
                      Referred {data.referral.referredCount} friend
                      {data.referral.referredCount === 1 ? "" : "s"} ({data.referral.convertedCount}{" "}
                      converted)
                    </li>
                  ) : null}
                </ul>
              </>
            ) : null}

            {/* Email history */}
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Emails
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {data.sendTotals.total} sent, {data.sendTotals.opened} opened,{" "}
              {data.sendTotals.clicked} clicked
              {data.sendTotals.bounced > 0 ? `, ${data.sendTotals.bounced} bounced` : ""}
            </p>
            <ol className="mt-2 space-y-2">
              {data.sends.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onOpenSend(s.id)}
                    className="w-full rounded-lg border border-slate-200 p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status] ?? "bg-slate-100 text-slate-600"}`}
                      >
                        {s.status}
                      </span>
                      <span className="font-mono text-xs text-slate-400">{s.category}</span>
                      <span className="ml-auto shrink-0 text-xs text-slate-400">
                        {fmtWhen(s.created_at)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-sm text-slate-900">
                      {s.subject || "(no subject)"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {s.opened_at ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                          opened
                        </span>
                      ) : null}
                      {s.clicked_at ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                          clicked
                        </span>
                      ) : null}
                      {s.bounced_at ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                          bounced
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
              {data.sends.length === 0 ? (
                <li className="py-6 text-center text-sm text-slate-400">
                  No emails logged for this address yet.
                </li>
              ) : null}
            </ol>
          </>
        ) : null}
      </div>
    </div>
  );
}
