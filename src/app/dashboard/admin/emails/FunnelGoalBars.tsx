"use client";

// Two labeled <progress> bars under a funnel's "entered / converted" line:
// Activation and Paid, each against its goal ("Activation 34% of 80% goal
// (17/50)"). The text label carries the full meaning; the bar and the goal
// tick are decoration on top of it. An inline "Edit target" form writes the
// goal through the set-target PATCH (app_config, no migration needed).
//
// Renders nothing when the API predates Funnels v2 (no `metrics` field).

import { useId, useState, type FormEvent } from "react";

import { goalBarView, parseTargetInput, pctLabel, type MetricBlock } from "./funnel-admin-format";

type Metric = "activation" | "paid";

const LABELS: Record<Metric, string> = { activation: "Activation", paid: "Paid" };

const HELP: Record<Metric, string> = {
  activation:
    "Share of people who entered this funnel and then ran a butler, paired the extension or finished setup within 14 days.",
  paid: "Share of people who entered this funnel and then started a paid plan.",
};

function GoalBar({
  metric,
  block,
  funnel,
  targetKey,
  canEdit,
  onSaved,
}: {
  metric: Metric;
  block: MetricBlock | null | undefined;
  funnel: string;
  targetKey: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const id = useId();
  const barId = `${id}-bar`;
  const inputId = `${id}-target`;
  const view = goalBarView(LABELS[metric], block);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openForm() {
    const current = block?.target;
    setValue(typeof current === "number" ? String(Math.round(current * 100)) : "80");
    setError(null);
    setEditing(true);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    const target = parseTargetInput(value);
    if (target == null) {
      setError("Enter a goal from 1 to 100 percent.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/emails/system-sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-target", funnel, key: targetKey, metric, value: target }),
        cache: "no-store",
      });
      if (!res.ok) {
        let msg = `Could not save the goal (HTTP ${res.status}).`;
        try {
          const json = (await res.json()) as { error?: string };
          if (json.error) msg = json.error;
        } catch {
          // keep the status message
        }
        if (res.status === 403) msg = "You need the marketing.send permission to change goals.";
        setError(msg);
        return;
      }
      setEditing(false);
      onSaved();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  const barColor =
    view.kind === "value" && view.meetsTarget
      ? "[&::-webkit-progress-value]:bg-emerald-700 [&::-moz-progress-bar]:bg-emerald-700"
      : "[&::-webkit-progress-value]:bg-amber-700 [&::-moz-progress-bar]:bg-amber-700";

  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {view.kind === "value" ? (
          <label htmlFor={barId} className="text-xs font-medium text-slate-700" title={HELP[metric]}>
            {view.text}
            {view.meetsTarget ? <span className="ml-1 text-emerald-700">(on goal)</span> : null}
          </label>
        ) : (
          <span
            className="text-xs text-slate-500"
            title={
              view.kind === "unmeasurable"
                ? "Everyone in this cohort entered before the activation signal existed, so there is nothing fair to measure yet."
                : HELP[metric]
            }
          >
            {view.text}
          </span>
        )}
        {canEdit && !editing ? (
          <button
            type="button"
            onClick={openForm}
            className="rounded text-xs font-medium text-indigo-700 underline-offset-2 hover:underline"
            aria-label={`Edit target for ${LABELS[metric].toLowerCase()}`}
          >
            Edit target
          </button>
        ) : null}
      </div>
      {view.kind === "value" ? (
        <div className="relative mt-1">
          <progress
            id={barId}
            max={100}
            value={view.valuePct}
            className={`block h-2 w-full overflow-hidden rounded-full bg-slate-100 [&::-webkit-progress-bar]:bg-slate-100 ${barColor}`}
          >
            {view.valuePct}%
          </progress>
          <span
            aria-hidden="true"
            className="absolute -top-0.5 h-3 w-0.5 bg-slate-700"
            style={{ left: `calc(${Math.min(100, view.targetPct)}% - 1px)` }}
          />
        </div>
      ) : null}
      {editing ? (
        <form onSubmit={(e) => void save(e)} className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor={inputId} className="block text-xs font-medium text-slate-600">
              {LABELS[metric]} goal (%)
            </label>
            <input
              id={inputId}
              type="number"
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-1 w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
          >
            {busy ? "Saving..." : "Save goal"}
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>
          {block?.target != null ? (
            <span className="text-xs text-slate-500">Current goal: {pctLabel(block.target)}</span>
          ) : null}
          {error ? (
            <p role="alert" className="w-full text-xs text-rose-700">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </div>
  );
}

export default function FunnelGoalBars({
  funnel,
  targetKey,
  metrics,
  canEdit,
  onSaved,
}: {
  funnel: string;
  /** app_config key: "system:<funnel>" or "seq:<uuid>". */
  targetKey: string;
  metrics?: { activation?: MetricBlock | null; paid?: MetricBlock | null } | null;
  canEdit: boolean;
  onSaved: () => void;
}) {
  if (!metrics || (!metrics.activation && !metrics.paid)) return null;
  return (
    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:gap-6">
      {(["activation", "paid"] as const).map((m) => (
        <GoalBar
          key={m}
          metric={m}
          block={metrics[m]}
          funnel={funnel}
          targetKey={targetKey}
          canEdit={canEdit}
          onSaved={onSaved}
        />
      ))}
    </div>
  );
}
