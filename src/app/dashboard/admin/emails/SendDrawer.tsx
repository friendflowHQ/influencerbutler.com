"use client";

// Right-side drawer showing one email send in full: metadata plus the event
// timeline (which links were clicked, from what device/IP). Sits at z-40 so
// it stacks ABOVE the customer drawer (z-30), mirroring the support page's
// ticket-over-history pair.

import { useEffect, useState } from "react";

type SendDetail = {
  id: string;
  resend_id: string | null;
  broadcast_id: string | null;
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
  last_event_at: string | null;
  created_at: string;
};

type SendEvent = {
  type: string;
  url: string;
  ip: string | null;
  user_agent: string | null;
  bounce_type: string | null;
  occurred_at: string;
};

type SendResponse = {
  send: SendDetail | null;
  events: SendEvent[];
  migrationPending: boolean;
  eventsMigrationPending: boolean;
  error?: string;
};

const STATUS_BADGE: Record<string, string> = {
  sent: "bg-emerald-50 text-emerald-700",
  suppressed: "bg-amber-50 text-amber-700",
  failed: "bg-rose-50 text-rose-700",
};

const EVENT_DOT: Record<string, string> = {
  delivered: "bg-slate-400",
  opened: "bg-indigo-500",
  clicked: "bg-sky-500",
  bounced: "bg-rose-500",
  complained: "bg-rose-500",
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
    second: "2-digit",
  });
}

/** Timeline synthesized from the first-event columns for sends that predate
 * the detailed events table. */
function syntheticEvents(send: SendDetail): SendEvent[] {
  const entries: [string, string | null][] = [
    ["delivered", send.delivered_at],
    ["opened", send.opened_at],
    ["clicked", send.clicked_at],
    ["bounced", send.bounced_at],
    ["complained", send.complained_at],
  ];
  return entries
    .filter((e): e is [string, string] => Boolean(e[1]))
    .map(([type, ts]) => ({
      type,
      url: "",
      ip: null,
      user_agent: null,
      bounce_type: null,
      occurred_at: ts,
    }))
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
}

export default function SendDrawer({
  sendId,
  onClose,
  onOpenCustomer,
}: {
  sendId: string;
  onClose: () => void;
  onOpenCustomer: (email: string) => void;
}) {
  const [data, setData] = useState<SendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setData(null);
      setError(null);
      try {
        const res = await fetch(`/api/admin/emails/send?id=${encodeURIComponent(sendId)}`, {
          cache: "no-store",
        });
        const json = (await res.json()) as SendResponse;
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
  }, [sendId]);

  const send = data?.send ?? null;
  const usingSynthetic = Boolean(send && (data?.events.length ?? 0) === 0);
  const events = send && usingSynthetic ? syntheticEvents(send) : data?.events ?? [];

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            {send ? (
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_BADGE[send.status] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {send.status}
                </span>
                <span className="font-mono text-xs text-slate-400">{send.category}</span>
              </div>
            ) : null}
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              {send ? send.subject || "(no subject)" : "Loading email…"}
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
        {!send && !error ? (
          <div className="mt-6 h-24 animate-pulse rounded-lg bg-slate-100" />
        ) : null}

        {send ? (
          <>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <dt className="text-slate-400">Recipient</dt>
                <dd className="text-slate-700">
                  <button
                    type="button"
                    onClick={() => onOpenCustomer(send.recipient)}
                    className="text-left underline decoration-slate-300 decoration-dotted underline-offset-2 hover:text-indigo-600"
                    title={`Everything about ${send.recipient}`}
                  >
                    {send.recipient}
                  </button>
                </dd>
              </div>
              <div>
                <dt className="text-slate-400">Funnel</dt>
                <dd className="text-slate-700">{send.funnel}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Sent</dt>
                <dd className="text-slate-700">{fmt(send.created_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Last activity</dt>
                <dd className="text-slate-700">{fmt(send.last_event_at)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Resend id</dt>
                <dd className="break-all font-mono text-xs text-slate-500">
                  {send.resend_id ?? "-"}
                </dd>
              </div>
              {send.broadcast_id ? (
                <div>
                  <dt className="text-slate-400">Broadcast id</dt>
                  <dd className="break-all font-mono text-xs text-slate-500">{send.broadcast_id}</dd>
                </div>
              ) : null}
            </dl>

            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Timeline
            </h3>
            {data?.eventsMigrationPending ? (
              <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                The email_send_events table is missing. Apply the 20260816 migration to record
                per-event detail (clicked links, devices).
              </div>
            ) : null}
            {usingSynthetic && events.length > 0 ? (
              <p className="mt-1 text-xs text-slate-400">
                Summary timeline from first-event timestamps. Detailed events (clicked links,
                devices) accrue for activity after the events table deploys.
              </p>
            ) : null}
            <ol className="mt-3 space-y-3">
              <li className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <div>
                  <p className="text-sm text-slate-800">
                    {send.status === "suppressed"
                      ? "Skipped: recipient is on the suppression list"
                      : send.status === "failed"
                        ? "Send failed"
                        : "Sent"}
                  </p>
                  <p className="text-xs text-slate-400">{fmt(send.created_at)}</p>
                </div>
              </li>
              {events.map((ev, i) => (
                <li key={`${ev.type}-${ev.occurred_at}-${i}`} className="flex gap-3">
                  <span
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${EVENT_DOT[ev.type] ?? "bg-slate-300"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-slate-800">
                      {ev.type}
                      {ev.bounce_type ? (
                        <span className="ml-2 text-xs text-rose-600">({ev.bounce_type})</span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-400">{fmt(ev.occurred_at)}</p>
                    {ev.url ? (
                      <p
                        className="mt-0.5 truncate font-mono text-xs text-sky-700"
                        title={ev.url}
                      >
                        {ev.url}
                      </p>
                    ) : null}
                    {ev.user_agent || ev.ip ? (
                      <p className="mt-0.5 truncate text-xs text-slate-400" title={ev.user_agent ?? ""}>
                        {[ev.ip, ev.user_agent].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </li>
              ))}
              {events.length === 0 && !data?.eventsMigrationPending ? (
                <li className="text-sm text-slate-400">
                  No delivery or engagement events recorded yet.
                </li>
              ) : null}
            </ol>
          </>
        ) : null}
      </div>
    </div>
  );
}
