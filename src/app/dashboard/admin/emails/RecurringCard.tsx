"use client";

// On/off switch and status for the recurring Group Mirror email: every two
// weeks it emails people who have opened our emails, have no subscription or
// trial, and have not been sent this series yet. The run itself happens in the
// email-marketing cron (src/lib/recurring-campaign.ts); this card only shows the
// state and flips it on or off.

import { useCallback, useEffect, useState } from "react";

type RecurringRun = {
  at: string;
  campaignId: string | null;
  recipients: number;
  outcome: "sent" | "skipped_too_few" | "error";
  note?: string;
};

type RecurringState = {
  enabled: boolean;
  nextRunAt: string;
  lastRunAt: string | null;
  history: RecurringRun[];
  everyDays: number;
  maxPerRun: number;
  minToSend: number;
  pricingNoteEndsAt: string;
};

function fmtMountain(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-US", {
    timeZone: "America/Denver",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const OUTCOME_LABEL: Record<RecurringRun["outcome"], string> = {
  sent: "queued",
  skipped_too_few: "skipped (too few new openers)",
  error: "failed, nothing sent",
};

export default function RecurringCard() {
  const [state, setState] = useState<RecurringState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/emails/recurring", { cache: "no-store" });
      if (!res.ok) return;
      setState((await res.json()) as RecurringState);
    } catch {
      // the card just stays hidden if the status cannot be read
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/emails/recurring", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) {
        setError("Could not save. Try again.");
        return;
      }
      setState((await res.json()) as RecurringState);
    } catch {
      setError("Could not save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!state) return null;
  const last = state.history.length > 0 ? state.history[state.history.length - 1] : null;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">
            Automatic Group Mirror send{" "}
            <span
              className={`ml-1 rounded px-1.5 py-0.5 text-xs font-medium ${
                state.enabled ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {state.enabled ? "On" : "Paused"}
            </span>
          </h3>
          <p className="mt-1 text-xs text-slate-500">
            Every {state.everyDays} days it emails people who have opened any of our emails, have no
            subscription or trial, and were never sent this series. Up to{" "}
            {state.maxPerRun.toLocaleString("en-US")} per run, skipped if fewer than{" "}
            {state.minToSend} qualify. The pricing P.S. is dropped on sends from{" "}
            {fmtMountain(state.pricingNoteEndsAt)}.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggle(!state.enabled)}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white transition disabled:opacity-60 ${
            state.enabled ? "bg-slate-700 hover:bg-slate-600" : "bg-indigo-600 hover:bg-indigo-500"
          }`}
        >
          {state.enabled ? "Pause" : "Turn on"}
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {state.enabled ? "Next run: " : "Would next run: "}
        <span className="font-medium">{fmtMountain(state.nextRunAt)}</span>
        {last ? (
          <>
            {" "}
            | Last run: {fmtMountain(last.at)}, {last.recipients.toLocaleString("en-US")} people,{" "}
            {OUTCOME_LABEL[last.outcome]}
          </>
        ) : null}
      </p>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  );
}
