"use client";

// Right-side drawer showing one sequence step in full: the email copy that goes
// out, the per-recipient list of who was already sent it (with open/click, each
// opening the full SendDrawer timeline), and who is still scheduled to receive
// it and when. Mirrors CampaignDrawer (z-40).

import { useEffect, useState } from "react";

type StepMeta = {
  position: number;
  day_offset: number;
  subject: string;
  body: string;
};

type SentRow = {
  id: string;
  recipient: string;
  status: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  created_at: string;
};

type ScheduledRow = {
  email: string;
  enrolled_at: string;
  next_send_at: string | null;
};

type StepResponse = {
  step: StepMeta;
  sendHour: number | null;
  sequenceName: string;
  sent: { rows: SentRow[]; total: number; page: number; pageSize: number };
  scheduled: { rows: ScheduledRow[]; total: number; page: number; pageSize: number };
  migrationPending: boolean;
  error?: string;
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700",
  suppressed: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
};

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

/** "9:00 AM MT" style label for a fixed send hour (0-23), else null. */
function sendHourLabel(hour: number | null): string | null {
  if (hour == null || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period} MT`;
}

export default function SequenceStepDrawer({
  sequenceId,
  position,
  onClose,
  onOpenCustomer,
  onOpenSend,
}: {
  sequenceId: string;
  position: number;
  onClose: () => void;
  onOpenCustomer: (email: string) => void;
  onOpenSend: (sendId: string) => void;
}) {
  const [data, setData] = useState<StepResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sentPage, setSentPage] = useState(0);
  const [schedPage, setSchedPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setData(null);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/emails/sequence-step?sequenceId=${encodeURIComponent(sequenceId)}` +
            `&position=${position}&page=${sentPage}&schedPage=${schedPage}`,
          { cache: "no-store" },
        );
        const json = (await res.json()) as StepResponse;
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
  }, [sequenceId, position, sentPage, schedPage]);

  const step = data?.step ?? null;
  const hourLabel = data ? sendHourLabel(data.sendHour) : null;
  const sentPages = data ? Math.max(1, Math.ceil(data.sent.total / data.sent.pageSize)) : 1;
  const schedPages = data
    ? Math.max(1, Math.ceil(data.scheduled.total / data.scheduled.pageSize))
    : 1;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">
              Step {position}
              {step ? ` · day ${step.day_offset}` : ""}
              {hourLabel ? ` · ${hourLabel}` : ""}
            </span>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              {step ? step.subject || "(no subject)" : "Loading step…"}
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
        {!data && !error ? (
          <div className="mt-6 h-32 animate-pulse rounded-lg bg-slate-100" />
        ) : null}

        {step && data ? (
          <>
            <p className="mt-3 text-xs text-slate-500">
              Sends {step.day_offset === 0 ? "immediately on enrollment" : `${step.day_offset} day(s) after each person enrolls`}
              {hourLabel ? `, at ${hourLabel}` : ""}.
            </p>

            <h3 className="mt-5 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Email body
            </h3>
            <pre className="mt-2 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-3 font-sans text-sm text-slate-800">
              {step.body || "(empty body)"}
            </pre>

            {/* Sent */}
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Sent ({data.sent.total.toLocaleString("en-US")})
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
                  {data.sent.rows.map((r) => (
                    <tr key={r.id} className="border-b border-slate-50 last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                        <button
                          type="button"
                          onClick={() => onOpenSend(r.id)}
                          className="underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-600"
                          title="Open the full delivery + click timeline"
                        >
                          {fmt(r.created_at)}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenCustomer(r.recipient)}
                          className="text-left text-slate-800 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-600"
                        >
                          {r.recipient}
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
                  {data.sent.rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-sm text-slate-400">
                        No one has been sent this step yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.sent.total > data.sent.pageSize ? (
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <button
                  type="button"
                  onClick={() => setSentPage((p) => Math.max(0, p - 1))}
                  disabled={sentPage === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {sentPage + 1} of {sentPages}
                </span>
                <button
                  type="button"
                  onClick={() => setSentPage((p) => Math.min(sentPages - 1, p + 1))}
                  disabled={sentPage >= sentPages - 1}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            ) : null}

            {/* Scheduled */}
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Scheduled ({data.scheduled.total.toLocaleString("en-US")})
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              People enrolled who have not reached this step yet, with when it will send.
            </p>
            <div className="mt-2 overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium">Enrolled</th>
                    <th className="px-3 py-2 font-medium">Sends</th>
                  </tr>
                </thead>
                <tbody>
                  {data.scheduled.rows.map((r) => (
                    <tr key={r.email} className="border-b border-slate-50 last:border-0">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => onOpenCustomer(r.email)}
                          className="text-left text-slate-800 underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-600"
                        >
                          {r.email}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                        {fmt(r.enrolled_at)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-700">
                        {fmt(r.next_send_at)}
                      </td>
                    </tr>
                  ))}
                  {data.scheduled.rows.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                        No one is waiting on this step.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {data.scheduled.total > data.scheduled.pageSize ? (
              <div className="mt-2 flex items-center justify-between text-sm text-slate-600">
                <button
                  type="button"
                  onClick={() => setSchedPage((p) => Math.max(0, p - 1))}
                  disabled={schedPage === 0}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 transition hover:bg-slate-50 disabled:opacity-40"
                >
                  Previous
                </button>
                <span>
                  Page {schedPage + 1} of {schedPages}
                </span>
                <button
                  type="button"
                  onClick={() => setSchedPage((p) => Math.min(schedPages - 1, p + 1))}
                  disabled={schedPage >= schedPages - 1}
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
