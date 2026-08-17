"use client";

// Right-side drawer showing one campaign in full: subject, body, audience,
// times, tag-on-send settings, and the recipient list with per-recipient
// status, sent time, and engagement. Mirrors SendDrawer (z-40).

import { useEffect, useState } from "react";

type Audience =
  | { kind: "all_contacts" }
  | { kind: "tag"; tag: string }
  | { kind: "segment"; segment: string }
  | { kind: "pasted"; emails: string[] };

type CampaignDetail = {
  id: string;
  name: string;
  subject: string;
  body: string;
  audience: Audience;
  status: string;
  scheduled_at: string | null;
  created_at: string;
  sent_at: string | null;
  apply_tag?: string | null;
  save_contacts?: boolean | null;
  category: string;
};

type RecipientRow = {
  email: string;
  status: string;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
};

type CampaignResponse = {
  campaign: CampaignDetail | null;
  counts: { queued: number; sent: number; skipped: number; failed: number };
  recipients: RecipientRow[];
  total: number;
  page: number;
  pageSize: number;
  migrationPending: boolean;
  error?: string;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  sending: "bg-sky-50 text-sky-700",
  sent: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-rose-50 text-rose-700",
  queued: "bg-slate-100 text-slate-600",
  skipped: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
};

const SEGMENT_LABELS: Record<string, string> = {
  trial: "Trial users",
  pro: "Pro subscribers",
  churned: "Churned customers",
  newsletter: "Newsletter subscribers",
};

function audienceLabel(a: Audience): string {
  if (a.kind === "all_contacts") return "All contacts";
  if (a.kind === "tag") return `Tag: ${a.tag}`;
  if (a.kind === "segment") return `Segment: ${SEGMENT_LABELS[a.segment] ?? a.segment}`;
  return `Pasted list (${a.emails.length})`;
}

function fmt(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function CampaignDrawer({
  campaignId,
  onClose,
  onOpenCustomer,
}: {
  campaignId: string;
  onClose: () => void;
  onOpenCustomer: (email: string) => void;
}) {
  const [data, setData] = useState<CampaignResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setData(null);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/emails/campaign?id=${encodeURIComponent(campaignId)}&page=${page}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as CampaignResponse;
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
  }, [campaignId, page]);

  const campaign = data?.campaign ?? null;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {campaign ? (
              <span
                className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[campaign.status] ?? "bg-slate-100 text-slate-600"}`}
              >
                {campaign.status}
              </span>
            ) : null}
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              {campaign ? campaign.name : "Loading campaign…"}
            </h2>
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
        {!campaign && !error ? (
          <div className="mt-6 h-32 animate-pulse rounded-lg bg-slate-100" />
        ) : null}

        {campaign && data ? (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div className="col-span-2">
                <dt className="text-slate-400">Subject</dt>
                <dd className="text-slate-800">{campaign.subject || "(no subject)"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Audience</dt>
                <dd className="text-slate-700">{audienceLabel(campaign.audience)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Recipients</dt>
                <dd className="text-slate-700">
                  {data.counts.sent.toLocaleString("en-US")} sent
                  {data.counts.queued > 0 ? `, ${data.counts.queued} queued` : ""}
                  {data.counts.skipped > 0 ? `, ${data.counts.skipped} skipped` : ""}
                  {data.counts.failed > 0 ? `, ${data.counts.failed} failed` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Created</dt>
                <dd className="text-slate-700">{fmt(campaign.created_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">{campaign.sent_at ? "Sent" : "Scheduled"}</dt>
                <dd className="text-slate-700">{fmt(campaign.sent_at ?? campaign.scheduled_at)}</dd>
              </div>
              {campaign.apply_tag || campaign.save_contacts ? (
                <div className="col-span-2">
                  <dt className="text-slate-400">Tag on send</dt>
                  <dd className="text-slate-700">
                    {campaign.apply_tag ? (
                      <span className="font-mono text-xs">{campaign.apply_tag}</span>
                    ) : (
                      "recipients saved to Contacts"
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Email body
            </h3>
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">
              {campaign.body || "(empty body)"}
            </pre>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Recipients ({data.total.toLocaleString("en-US")})
            </h3>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recipients.map((r) => (
                    <tr key={r.email} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                        {fmt(r.sent_at)}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenCustomer(r.email)}
                          className="text-left text-slate-800 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-600"
                        >
                          {r.email}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status] ?? "bg-slate-100 text-slate-600"}`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex flex-wrap gap-1">
                          {r.opened_at ? (
                            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
                              opened
                            </span>
                          ) : null}
                          {r.clicked_at ? (
                            <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-700">
                              clicked
                            </span>
                          ) : null}
                          {r.bounced_at ? (
                            <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs text-rose-700">
                              bounced
                            </span>
                          ) : null}
                          {!r.opened_at && !r.clicked_at && !r.bounced_at ? (
                            <span className="text-xs text-slate-400">-</span>
                          ) : null}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.recipients.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                        No recipients yet. This campaign has not been sent.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.total > data.pageSize ? (
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
                  Page {page + 1} of {totalPages}
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
          </>
        ) : null}
      </div>
    </div>
  );
}
