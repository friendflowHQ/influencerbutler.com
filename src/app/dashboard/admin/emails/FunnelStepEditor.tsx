"use client";

// Right-side drawer for editing one step of a built-in email funnel. Mirrors
// SendDrawer's markup (z-40 backdrop that closes on click, max-w-2xl white
// panel). Saves override copy for a single step, or resets it back to the code
// default. Timing is code-scheduled and not editable here.

import { useState } from "react";

export type FunnelStep = {
  tier: string;
  label: string;
  category: string;
  day_offset: number;
  subject: string;
  subjectPreview: string;
  body: string;
  apply_tag: string | null;
  isOverridden: boolean;
};

type PatchResponse = { ok?: boolean; migrationPending?: boolean; error?: string };

export default function FunnelStepEditor({
  funnelKey,
  funnelName,
  funnelVars,
  step,
  canEdit,
  onClose,
  onSaved,
  stats,
}: {
  funnelKey: string;
  funnelName: string;
  funnelVars: string[];
  step: FunnelStep;
  canEdit: boolean;
  onClose: () => void;
  onSaved: () => void;
  stats?: { sent: number; openPct: string; clickPct: string };
}) {
  const [subject, setSubject] = useState(step.subject);
  const [body, setBody] = useState(step.body);
  const [applyTag, setApplyTag] = useState(step.apply_tag ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);

  async function submit(action: "save" | "reset") {
    setBusy(true);
    setError(null);
    setMigrationPending(false);
    try {
      const payload =
        action === "save"
          ? { funnel: funnelKey, tier: step.tier, action, subject, body, applyTag }
          : { funnel: funnelKey, tier: step.tier, action };
      const res = await fetch("/api/admin/emails/system-sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
      });
      let json: PatchResponse = {};
      try {
        json = (await res.json()) as PatchResponse;
      } catch {
        // non-JSON body; fall back to status-based messaging below
      }
      if (!res.ok) {
        if (json.migrationPending || res.status === 409) {
          setMigrationPending(true);
          return;
        }
        if (res.status === 403) {
          setError("You need the marketing.send permission to edit.");
          return;
        }
        setError(json.error ?? `Could not ${action} this step (HTTP ${res.status}).`);
        return;
      }
      if (json.migrationPending) {
        setMigrationPending(true);
        return;
      }
      onSaved();
      onClose();
    } catch {
      setError("Network error. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  function appendVar(name: string) {
    setBody((prev) => `${prev}{{${name}}}`);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs text-slate-400">{funnelKey}</span>
              {step.isOverridden ? (
                <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  edited
                </span>
              ) : null}
            </div>
            <h2 className="mt-2 text-lg font-semibold text-slate-900">
              {funnelName}: {step.label}
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

        <p className="mt-2 text-sm text-slate-500">
          Sends ~day {step.day_offset} of the funnel. Timing is code-scheduled (not editable yet).
        </p>

        {stats ? (
          <p className="mt-1 text-xs text-slate-400">
            {stats.sent.toLocaleString("en-US")} sent / {stats.openPct} open / {stats.clickPct}{" "}
            click
          </p>
        ) : null}

        {!canEdit ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            You need the marketing.send permission to edit. Showing the current copy read-only.
          </div>
        ) : null}

        {migrationPending ? (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Apply the 20260819_funnel_overrides.sql migration to save edits.
          </div>
        ) : null}

        <div className="mt-5">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            readOnly={!canEdit}
            disabled={!canEdit}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            readOnly={!canEdit}
            disabled={!canEdit}
            rows={16}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
          />
        </div>

        {funnelVars.length > 0 ? (
          <div className="mt-3">
            <p className="text-xs text-slate-500">
              Use these in your copy; they get filled in per recipient.
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {funnelVars.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => appendVar(name)}
                  disabled={!canEdit}
                  title={`Insert {{${name}}} at the end of the body`}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs text-slate-600 transition hover:bg-slate-100 disabled:cursor-default disabled:opacity-60"
                >
                  {`{{${name}}}`}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Tag on send
          </label>
          <input
            type="text"
            value={applyTag}
            onChange={(e) => setApplyTag(e.target.value)}
            readOnly={!canEdit}
            disabled={!canEdit}
            placeholder="e.g. trial-day3"
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500"
          />
          <p className="mt-1 text-xs text-slate-400">
            Adds this tag to everyone who gets this email, on top of existing tags.
          </p>
        </div>

        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}

        {canEdit ? (
          <div className="mt-5 flex items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => void submit("save")}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm("Reset this step back to the built-in default copy?")) {
                  void submit("reset");
                }
              }}
              disabled={busy || !step.isOverridden}
              title={
                step.isOverridden ? "Delete the override and use the code default" : "No override to reset"
              }
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Reset to default
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
