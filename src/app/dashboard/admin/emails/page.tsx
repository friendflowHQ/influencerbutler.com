"use client";

// Admin Emails dashboard: funnel conversion strip, per-category send metrics
// (open/click rates from the Resend webhook), per-issue newsletter stats, and
// a searchable feed of individual sends. Data arrives from four parallel
// admin APIs so one slow panel never blocks the rest of the page.

import { useCallback, useEffect, useState } from "react";
import SendDrawer from "./SendDrawer";
import CustomerDrawer from "./CustomerDrawer";
import ContactsSection from "./ContactsSection";
import CampaignsSection from "./CampaignsSection";
import SequencesSection from "./SequencesSection";

type FunnelStats = {
  key: string;
  label: string;
  enteredLabel: string;
  convertedLabel: string | null;
  entered: number;
  converted: number | null;
};

type EmailAggregate = {
  key: string;
  funnel: string;
  sent: number;
  suppressed: number;
  failed: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
};

type TrackingStatus =
  | "ok"
  | "no_data"
  | "no_secret"
  | "no_events"
  | "no_engagement_tracking"
  | "clicks_untracked";

type TrackingHealth = {
  webhookConfigured: boolean;
  status: TrackingStatus;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
};

type SummaryResponse = {
  days: number;
  categories: EmailAggregate[];
  funnels: EmailAggregate[];
  migrationPending?: boolean;
  tracking?: TrackingHealth;
};

// Human-facing explanation + fix for each unhealthy tracking state, so a bare
// 0% open rate is never mistaken for real engagement. Keyed by the status the
// summary API computes; "ok" / "no_data" get no banner.
const TRACKING_MESSAGES: Record<string, { title: string; body: string }> = {
  no_secret: {
    title: "Open and click tracking is not recording",
    body: "The Resend webhook signing secret is not set, so open and click events are rejected before they can be counted. Add the endpoint https://www.influencerbutler.com/api/webhooks/resend in Resend (Webhooks), then set RESEND_WEBHOOK_SECRET in Vercel.",
  },
  no_events: {
    title: "No delivery, open, or click events are being received",
    body: "Emails are sending, but no Resend events are reaching the app in this window. Confirm the webhook endpoint https://www.influencerbutler.com/api/webhooks/resend exists in Resend (Webhooks), is subscribed to email.opened and email.clicked, and that RESEND_WEBHOOK_SECRET is set in Vercel.",
  },
  no_engagement_tracking: {
    title: "Deliveries are tracked, but no opens or clicks",
    body: "The webhook is working (deliveries land), but no opens or clicks are recorded. Turn on Open Tracking and Click Tracking for influencerbutler.com in the Resend dashboard (Domains): without them Resend never injects the tracking pixel or wraps links.",
  },
  clicks_untracked: {
    title: "Opens are tracked, but no clicks are being recorded",
    body: "Opens record fine, yet not a single click has come through: almost always the webhook is not subscribed to email.clicked. In Resend (Webhooks) open the endpoint https://www.influencerbutler.com/api/webhooks/resend and confirm email.clicked is in its event list. Also check that Click Tracking is on for influencerbutler.com under Domains.",
  },
};

type IssueStats = {
  index: number;
  subject: string;
  sentAt: string;
  recipients: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

type NewsletterResponse = {
  enabled: boolean;
  lastSentIndex: number;
  lastSentAt: string | null;
  totalIssues: number;
  untrackedSentIssues: number;
  issues: IssueStats[];
};

type SendRow = {
  id: string;
  recipient: string;
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

type SendsResponse = {
  rows: SendRow[];
  total: number;
  page: number;
  pageSize: number;
  migrationPending?: boolean;
};

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function fmtDate(iso: string | null): string {
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

/** Open rate uses delivered when available, falling back to sent (delivery
 * events can lag or be missing while the webhook is new). */
function openBase(a: EmailAggregate): number {
  return a.delivered > 0 ? a.delivered : a.sent;
}

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700",
  suppressed: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
};

export default function AdminEmailsPage() {
  const [forbidden, setForbidden] = useState(false);
  const [tab, setTab] = useState<"overview" | "contacts" | "campaigns" | "sequences">("overview");

  const [funnels, setFunnels] = useState<FunnelStats[] | null>(null);

  const [days, setDays] = useState(30);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [newsletter, setNewsletter] = useState<NewsletterResponse | null>(null);

  const [sends, setSends] = useState<SendsResponse | null>(null);
  const [sendsLoading, setSendsLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");

  // Drill-down drawers. The send drawer (z-40) stacks above the customer
  // drawer (z-30), so a send opened from inside the customer view sits on top.
  const [selectedSendId, setSelectedSendId] = useState<string | null>(null);
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);

  // Deep link: /dashboard/admin/emails?recipient=<email> auto-opens the
  // customer drawer and filters the sends table (same idiom as comps ?q=).
  useEffect(() => {
    try {
      const r = new URLSearchParams(window.location.search).get("recipient");
      if (r) {
        const email = r.trim().toLowerCase();
        setCustomerEmail(email);
        setQueryInput(email);
        setQuery(email);
      }
    } catch {
      // ignore malformed URLs
    }
  }, []);

  const handle403 = useCallback((res: Response): boolean => {
    if (res.status === 403) {
      setForbidden(true);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/emails/funnels", { cache: "no-store" });
        if (handle403(res) || !res.ok) return;
        setFunnels(((await res.json()) as { funnels: FunnelStats[] }).funnels);
      } catch {
        // panel stays empty
      }
    })();
  }, [handle403]);

  useEffect(() => {
    void (async () => {
      setSummaryLoading(true);
      try {
        const res = await fetch(`/api/admin/emails/summary?days=${days}`, { cache: "no-store" });
        if (handle403(res) || !res.ok) return;
        setSummary((await res.json()) as SummaryResponse);
      } catch {
        // panel stays empty
      } finally {
        setSummaryLoading(false);
      }
    })();
  }, [days, handle403]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/emails/newsletter", { cache: "no-store" });
        if (handle403(res) || !res.ok) return;
        setNewsletter((await res.json()) as NewsletterResponse);
      } catch {
        // panel stays empty
      }
    })();
  }, [handle403]);

  useEffect(() => {
    void (async () => {
      setSendsLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page) });
        if (query) params.set("query", query);
        const res = await fetch(`/api/admin/emails/sends?${params}`, { cache: "no-store" });
        if (handle403(res) || !res.ok) return;
        setSends((await res.json()) as SendsResponse);
      } catch {
        // panel stays empty
      } finally {
        setSendsLoading(false);
      }
    })();
  }, [page, query, handle403]);

  if (forbidden) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">Admin only</h1>
        <p className="mt-2 text-slate-600">You do not have access to this page.</p>
      </div>
    );
  }

  const totalPages = sends ? Math.max(1, Math.ceil(sends.total / sends.pageSize)) : 1;
  const migrationPending = Boolean(summary?.migrationPending || sends?.migrationPending);
  const trackingWarning =
    !migrationPending && summary?.tracking && summary.tracking.status in TRACKING_MESSAGES
      ? TRACKING_MESSAGES[summary.tracking.status]
      : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Emails</h1>
        <p className="mt-1 text-sm text-slate-600">
          Every email the app sends: who got it, who opened it, and how each funnel converts.
        </p>
      </div>

      {/* Tab switcher */}
      <div className="mt-6 flex gap-1 border-b border-slate-200">
        {([
          { key: "overview", label: "Overview" },
          { key: "contacts", label: "Contacts" },
          { key: "campaigns", label: "Campaigns" },
          { key: "sequences", label: "Sequences" },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
              tab === t.key
                ? "border-[#f97316] text-[#f97316]"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {migrationPending ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The email_sends table is missing. Apply supabase/migrations/20260816_email_sends.sql to
          prod, then set up the Resend webhook (RESEND_WEBHOOK_SECRET) to start collecting data.
        </div>
      ) : null}

      {trackingWarning ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">{trackingWarning.title}</p>
          <p className="mt-1">{trackingWarning.body}</p>
        </div>
      ) : null}

      {tab === "overview" ? (
        <>
      {/* Funnel conversions */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Funnel conversions (all time)
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(funnels ?? []).map((f) => (
            <div key={f.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-3xl font-extrabold text-indigo-600">
                {f.converted !== null && f.entered > 0 ? pct(f.converted, f.entered) : "-"}
              </p>
              <p className="mt-1 text-xs font-medium text-slate-500">{f.label}</p>
              <p className="mt-2 text-xs text-slate-500">
                {f.entered.toLocaleString("en-US")} {f.enteredLabel}
                {f.convertedLabel !== null && f.converted !== null
                  ? ` / ${f.converted.toLocaleString("en-US")} ${f.convertedLabel}`
                  : ""}
              </p>
            </div>
          ))}
          {funnels === null ? (
            <div className="col-span-2 h-24 animate-pulse rounded-xl bg-slate-100 lg:col-span-4" />
          ) : null}
        </div>
      </section>

      {/* Per-category metrics */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Sends by email type
          </h2>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                  days === d
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">Email</th>
                <th className="px-4 py-2.5 font-medium">Funnel</th>
                <th className="px-4 py-2.5 text-right font-medium">Sent</th>
                <th className="px-4 py-2.5 text-right font-medium">Delivered</th>
                <th className="px-4 py-2.5 text-right font-medium">Open %</th>
                <th className="px-4 py-2.5 text-right font-medium">Click %</th>
                <th className="px-4 py-2.5 text-right font-medium">Bounced</th>
                <th className="px-4 py-2.5 text-right font-medium">Skipped</th>
              </tr>
            </thead>
            <tbody>
              {(summary?.categories ?? []).map((c) => (
                <tr key={c.key} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-slate-800">{c.key}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.funnel}</td>
                  <td className="px-4 py-2 text-right">{c.sent.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2 text-right">{c.delivered.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2 text-right font-semibold text-indigo-600">
                    {pct(c.opened, openBase(c))}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-sky-600">
                    {pct(c.clicked, openBase(c))}
                  </td>
                  <td className="px-4 py-2 text-right text-rose-600">
                    {c.bounced > 0 ? c.bounced.toLocaleString("en-US") : "-"}
                  </td>
                  <td className="px-4 py-2 text-right text-amber-600">
                    {c.suppressed > 0 ? c.suppressed.toLocaleString("en-US") : "-"}
                  </td>
                </tr>
              ))}
              {!summaryLoading && (summary?.categories ?? []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                    No sends recorded in the last {days} days. Data starts accruing once the
                    migration is applied and the code is deployed.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {summaryLoading ? <div className="h-24 animate-pulse bg-slate-50" /> : null}
        </div>
      </section>

      {/* Newsletter */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Newsletter</h2>
        {newsletter ? (
          <p className="mt-1 text-xs text-slate-500">
            {newsletter.lastSentIndex + 1} of {newsletter.totalIssues} issues sent
            {newsletter.lastSentAt ? `, last on ${fmtDate(newsletter.lastSentAt)}` : ""}.
            {newsletter.untrackedSentIssues > 0
              ? ` ${newsletter.untrackedSentIssues} earlier issue(s) predate tracking: their stats live in the Resend dashboard (Broadcasts).`
              : ""}
          </p>
        ) : null}
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">Issue</th>
                <th className="px-4 py-2.5 font-medium">Sent</th>
                <th className="px-4 py-2.5 text-right font-medium">Recipients</th>
                <th className="px-4 py-2.5 text-right font-medium">Delivered</th>
                <th className="px-4 py-2.5 text-right font-medium">Open %</th>
                <th className="px-4 py-2.5 text-right font-medium">Click %</th>
                <th className="px-4 py-2.5 text-right font-medium">Bounced</th>
              </tr>
            </thead>
            <tbody>
              {(newsletter?.issues ?? []).map((i) => (
                <tr key={i.index} className="border-b border-slate-50 last:border-0">
                  <td className="max-w-md truncate px-4 py-2 text-slate-800">
                    #{i.index + 1} {i.subject}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">{fmtDate(i.sentAt)}</td>
                  <td className="px-4 py-2 text-right">{i.recipients.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2 text-right">{i.delivered.toLocaleString("en-US")}</td>
                  <td className="px-4 py-2 text-right font-semibold text-indigo-600">
                    {pct(i.opened, i.delivered > 0 ? i.delivered : i.recipients)}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-sky-600">
                    {pct(i.clicked, i.delivered > 0 ? i.delivered : i.recipients)}
                  </td>
                  <td className="px-4 py-2 text-right text-rose-600">
                    {i.bounced > 0 ? i.bounced.toLocaleString("en-US") : "-"}
                  </td>
                </tr>
              ))}
              {newsletter && newsletter.issues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                    No tracked issues yet. Per-recipient stats appear for issues sent after this
                    feature deployed.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Recent sends */}
      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent sends
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setPage(0);
              setQuery(queryInput.trim());
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              placeholder="Search by recipient..."
              className="w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Search
            </button>
          </form>
        </div>
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">Recipient</th>
                <th className="px-4 py-2.5 font-medium">Subject</th>
                <th className="px-4 py-2.5 font-medium">Type</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Engagement</th>
              </tr>
            </thead>
            <tbody>
              {(sends?.rows ?? []).map((row) => (
                <tr
                  key={row.id}
                  onClick={() => setSelectedSendId(row.id)}
                  className="cursor-pointer border-b border-slate-50 last:border-0 hover:bg-slate-50"
                >
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-500">
                    {fmtDate(row.created_at)}
                  </td>
                  <td className="px-4 py-2 text-slate-800">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setCustomerEmail(row.recipient);
                      }}
                      className="text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-600"
                      title={`Everything about ${row.recipient}`}
                    >
                      {row.recipient}
                    </button>
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-slate-600">{row.subject}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">{row.category}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[row.status] ?? "bg-slate-100 text-slate-600"}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap gap-1">
                      {row.delivered_at ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                          delivered
                        </span>
                      ) : null}
                      {row.opened_at ? (
                        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                          opened
                        </span>
                      ) : null}
                      {row.clicked_at ? (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                          clicked
                        </span>
                      ) : null}
                      {row.bounced_at ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                          bounced
                        </span>
                      ) : null}
                      {row.complained_at ? (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                          complained
                        </span>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))}
              {!sendsLoading && (sends?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                    {query ? `No sends match "${query}".` : "No sends logged yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {sendsLoading ? <div className="h-24 animate-pulse bg-slate-50" /> : null}
        </div>
        {sends && sends.total > sends.pageSize ? (
          <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span>
              Page {page + 1} of {totalPages} ({sends.total.toLocaleString("en-US")} sends)
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        ) : null}
      </section>
        </>
      ) : null}

      {tab === "contacts" ? <ContactsSection onOpenCustomer={setCustomerEmail} /> : null}
      {tab === "campaigns" ? (
        <CampaignsSection summary={summary} onOpenCustomer={setCustomerEmail} />
      ) : null}
      {tab === "sequences" ? <SequencesSection summary={summary} /> : null}

      {customerEmail ? (
        <CustomerDrawer
          email={customerEmail}
          onClose={() => setCustomerEmail(null)}
          onOpenSend={setSelectedSendId}
        />
      ) : null}
      {selectedSendId ? (
        <SendDrawer
          sendId={selectedSendId}
          onClose={() => setSelectedSendId(null)}
          onOpenCustomer={(email) => {
            setCustomerEmail(email);
            setSelectedSendId(null);
          }}
        />
      ) : null}
    </div>
  );
}
