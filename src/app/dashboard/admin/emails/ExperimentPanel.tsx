"use client";

// A/B tests for one built-in funnel. Lists each experiment with its arms,
// sends, the primary metric rate per arm, p-value / confidence, which weekly
// look it is on (of 4) and its status, with Start / Stop. A "New A/B test"
// form creates a draft for one step and content key, with arm B copy (arm A
// is always the current copy). Talks to /api/admin/emails/experiments.
//
// Starts from the experiments the funnels GET already returned (if any) and
// refreshes from the experiments route when opened. Degrades quietly when
// the route or its migration (20261110_funnels_v2_measure.sql) is missing.

import { useCallback, useEffect, useId, useMemo, useState, type FormEvent } from "react";

import {
  armRate,
  confidenceLabel,
  contentKeyLabel,
  defaultPrimaryMetric,
  experimentStatusLabel,
  lookLabel,
  metricLabel,
  pctLabel,
  segmentForKey,
  validateArmB,
  type ExperimentMetric,
  type ExperimentSummary,
} from "./funnel-admin-format";

export type ExperimentStepOption = {
  tier: string;
  label: string;
  day_offset?: number;
  contentKeys?: { key: string; label?: string }[];
};

type ListResponse = { experiments?: ExperimentSummary[]; migrationPending?: boolean; error?: string };

const STATUS_TONE: Record<string, string> = {
  running: "bg-emerald-50 text-emerald-700",
  decided: "bg-indigo-50 text-indigo-700",
  stopped: "bg-slate-100 text-slate-600",
  draft: "bg-amber-50 text-amber-800",
};

const INPUT =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-slate-500";

async function errorText(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    if (json.error) return json.error;
  } catch {
    // fall through
  }
  if (res.status === 403) return "You need the marketing.send permission for A/B tests.";
  return `${fallback} (HTTP ${res.status}).`;
}

function ExperimentRow({
  exp,
  stepLabel,
  canEdit,
  busy,
  onAction,
}: {
  exp: ExperimentSummary;
  stepLabel: string;
  canEdit: boolean;
  busy: boolean;
  onAction: (exp: ExperimentSummary, action: "start" | "stop") => void;
}) {
  const status = String(exp.status ?? "draft");
  const primary = String(exp.primaryMetric ?? "click");
  const arms = [...(exp.arms ?? [])].sort((a, b) => (a.arm < b.arm ? -1 : 1));
  const conf = confidenceLabel(exp.decision);
  const segmentLabel = exp.contentKey ? contentKeyLabel(exp.contentKey) : "Base";
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">
              {exp.name && exp.name.trim() ? exp.name : `${stepLabel} test`}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status] ?? STATUS_TONE.draft}`}
            >
              {experimentStatusLabel(exp)}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {stepLabel} / {segmentLabel} / primary: {metricLabel(primary)}
            {exp.guardrailMetric ? ` / guardrail: ${metricLabel(String(exp.guardrailMetric))}` : ""}
            {status === "running" || status === "decided" ? ` / ${lookLabel(exp.looksDone)}` : ""}
            {conf ? ` / ${conf}` : ""}
          </p>
        </div>
        {canEdit && (status === "draft" || status === "running") ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(exp, status === "draft" ? "start" : "stop")}
            className={
              status === "draft"
                ? "rounded-lg bg-emerald-700 px-3 py-1 text-xs font-medium text-white transition hover:bg-emerald-800 disabled:opacity-40"
                : "rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
            }
          >
            {status === "draft" ? "Start" : "Stop"}
          </button>
        ) : null}
      </div>
      {arms.length > 0 ? (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Arm results for {exp.name || stepLabel}</caption>
            <thead className="text-slate-500">
              <tr>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Arm
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  Subject
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  Sends
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {metricLabel(primary)}
                </th>
                {exp.guardrailMetric ? (
                  <th scope="col" className="py-1 text-right font-medium">
                    {metricLabel(String(exp.guardrailMetric))}
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {arms.map((arm) => (
                <tr key={arm.arm} className="border-t border-slate-100">
                  <th scope="row" className="py-1 pr-3 font-medium">
                    {arm.arm.toUpperCase()}
                    {exp.winnerArm === arm.arm ? <span className="ml-1 text-emerald-700">(winner)</span> : null}
                  </th>
                  <td className="max-w-xs truncate py-1 pr-3">
                    {arm.subject && arm.subject.trim() ? arm.subject : "Current copy (control)"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {(arm.sends ?? 0).toLocaleString("en-US")}
                    {exp.minSendsPerArm ? (
                      <span className="text-slate-500"> / {exp.minSendsPerArm.toLocaleString("en-US")}</span>
                    ) : null}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{pctLabel(armRate(arm, primary))}</td>
                  {exp.guardrailMetric ? (
                    <td className="py-1 text-right tabular-nums">
                      {pctLabel(armRate(arm, String(exp.guardrailMetric)))}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function NewExperimentForm({
  funnel,
  steps,
  onCreated,
  onCancel,
}: {
  funnel: string;
  steps: ExperimentStepOption[];
  onCreated: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [tier, setTier] = useState(steps[0]?.tier ?? "");
  const step = steps.find((s) => s.tier === tier) ?? steps[0];
  const keys = useMemo(() => {
    const list = step?.contentKeys && step.contentKeys.length > 0 ? step.contentKeys : [{ key: tier }];
    return list.map((k) => ({ key: k.key, label: k.label || contentKeyLabel(k.key) }));
  }, [step, tier]);
  const [key, setKey] = useState(tier);
  const [name, setName] = useState("");
  const [primary, setPrimary] = useState<ExperimentMetric>(defaultPrimaryMetric(step?.day_offset));
  const [guardrail, setGuardrail] = useState<"" | ExperimentMetric>(
    defaultPrimaryMetric(step?.day_offset) === "click" ? "paid" : "click",
  );
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function pickTier(next: string) {
    setTier(next);
    setKey(next);
    const s = steps.find((x) => x.tier === next);
    const p = defaultPrimaryMetric(s?.day_offset);
    setPrimary(p);
    setGuardrail(p === "click" ? "paid" : "click");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const invalid = validateArmB(subject, body);
    if (invalid) {
      setError(invalid);
      return;
    }
    if (guardrail && guardrail === primary) {
      setError("Pick a guardrail metric that differs from the primary metric.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/emails/experiments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          funnel,
          tier,
          segment: segmentForKey(key),
          name: name.trim() || undefined,
          primaryMetric: primary,
          guardrailMetric: guardrail || null,
          armB: { subject, body },
        }),
      });
      if (!res.ok) {
        setError(
          res.status === 409
            ? await errorText(res, "A test is already running for this step")
            : await errorText(res, "Could not create the test"),
        );
        return;
      }
      onCreated();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs text-slate-600">
        Arm A keeps the current copy. Arm B is your new version. Saved as a draft; press Start when
        ready.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-step`} className={LABEL}>
            Step
          </label>
          <select id={`${id}-step`} value={tier} onChange={(e) => pickTier(e.target.value)} className={INPUT}>
            {steps.map((s) => (
              <option key={s.tier} value={s.tier}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-key`} className={LABEL}>
            Who gets it (content key)
          </label>
          <select id={`${id}-key`} value={key} onChange={(e) => setKey(e.target.value)} className={INPUT}>
            {keys.map((k) => (
              <option key={k.key} value={k.key}>
                {k.key === tier ? "Everyone at this step" : `${k.label} (${k.key})`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-primary`} className={LABEL}>
            Primary metric
          </label>
          <select
            id={`${id}-primary`}
            value={primary}
            onChange={(e) => setPrimary(e.target.value as ExperimentMetric)}
            className={INPUT}
          >
            <option value="click">Click rate</option>
            <option value="paid">Paid conversion</option>
            <option value="activation">Activation</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-guard`} className={LABEL}>
            Guardrail metric
          </label>
          <select
            id={`${id}-guard`}
            value={guardrail}
            onChange={(e) => setGuardrail(e.target.value as "" | ExperimentMetric)}
            className={INPUT}
          >
            <option value="">None</option>
            <option value="click">Click rate</option>
            <option value="paid">Paid conversion</option>
            <option value="activation">Activation</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-name`} className={LABEL}>
            Name (optional)
          </label>
          <input
            id={`${id}-name`}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            className={INPUT}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-subject`} className={LABEL}>
            Arm B subject
          </label>
          <input
            id={`${id}-subject`}
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={300}
            required
            className={INPUT}
          />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor={`${id}-body`} className={LABEL}>
            Arm B body
          </label>
          <textarea
            id={`${id}-body`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={10}
            required
            className={`${INPUT} font-mono`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Same {"{{variables}}"} as the step copy. Avoid literal dates and the price-lock line: the
            test runs for weeks.
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
        >
          {busy ? "Creating..." : "Create draft"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function ExperimentPanel({
  funnel,
  steps,
  initial,
  canEdit,
}: {
  funnel: string;
  steps: ExperimentStepOption[];
  /** Experiments the funnels GET already returned (absent on the old API). */
  initial?: ExperimentSummary[] | null;
  canEdit: boolean;
}) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [experiments, setExperiments] = useState<ExperimentSummary[]>(initial ?? []);
  const [loaded, setLoaded] = useState(false);
  const [migrationPending, setMigrationPending] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loaded && initial) setExperiments(initial);
  }, [initial, loaded]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/emails/experiments?funnel=${encodeURIComponent(funnel)}`, {
        cache: "no-store",
      });
      if (res.status === 404) {
        setUnavailable(true);
        return;
      }
      if (!res.ok) {
        setError(await errorText(res, "Could not load A/B tests"));
        return;
      }
      const json = (await res.json()) as ListResponse;
      setMigrationPending(!!json.migrationPending);
      setExperiments(
        (json.experiments ?? []).filter((x) => !x.funnel || x.funnel === funnel),
      );
      setLoaded(true);
    } catch {
      setError("Could not load A/B tests. Check your connection and try again.");
    }
  }, [funnel]);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  async function act(exp: ExperimentSummary, action: "start" | "stop") {
    if (
      action === "stop" &&
      !window.confirm("Stop this A/B test? Everyone goes back to the current copy and the test cannot restart.")
    ) {
      return;
    }
    setBusyId(exp.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/emails/experiments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ id: exp.id, action }),
      });
      if (!res.ok) {
        setError(await errorText(res, `Could not ${action} the test`));
        return;
      }
      await load();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusyId(null);
    }
  }

  const stepLabel = (tier: string | null | undefined) =>
    steps.find((s) => s.tier === tier)?.label ?? tier ?? "Step";
  const running = experiments.filter((x) => x.status === "running").length;

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded text-xs font-semibold uppercase tracking-wide text-slate-600 hover:text-slate-800"
      >
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        A/B tests
        <span className="font-normal normal-case text-slate-500">
          {experiments.length === 0
            ? "(none yet)"
            : `(${experiments.length.toLocaleString("en-US")}${running ? `, ${running} running` : ""})`}
        </span>
      </button>
      {open ? (
        <div id={panelId} className="mt-2 space-y-2">
          {unavailable ? (
            <p className="text-xs text-slate-500">A/B tests are not available on this deploy yet.</p>
          ) : null}
          {migrationPending ? (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Apply 20261110_funnels_v2_measure.sql to run A/B tests.
            </div>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-rose-700">
              {error}
            </p>
          ) : null}
          {experiments.map((exp) => (
            <ExperimentRow
              key={exp.id}
              exp={exp}
              stepLabel={stepLabel(exp.tier)}
              canEdit={canEdit && !unavailable}
              busy={busyId === exp.id}
              onAction={(x, a) => void act(x, a)}
            />
          ))}
          {loaded && experiments.length === 0 && !migrationPending ? (
            <p className="text-xs text-slate-500">No A/B tests for this funnel yet.</p>
          ) : null}
          {canEdit && !unavailable && !migrationPending && steps.length > 0 ? (
            creating ? (
              <NewExperimentForm
                funnel={funnel}
                steps={steps}
                onCancel={() => setCreating(false)}
                onCreated={() => {
                  setCreating(false);
                  void load();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                New A/B test
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
