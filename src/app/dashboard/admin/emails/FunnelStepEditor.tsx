"use client";

// Right-side drawer for editing one step of a built-in email funnel. Mirrors
// SendDrawer's markup (z-40 backdrop that closes on click, max-w-2xl white
// panel). Saves override copy, tag-on-send, and timing (day offset) for a
// single step, or resets it back to the code default.
//
// Funnels v2: a step can have several content keys (Base, Beginner, Power,
// module variants). When the API sends `contentKeys`, the editor shows one
// tab per key, each editing that key's own override. Timing lives on the
// Base tab only (the API rejects dayOffset for tailored keys). "Mark
// reviewed" stamps the step as checked without changing copy. Against the
// pre-v2 API (no contentKeys) it behaves exactly as before.

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

import UpdatedBadge from "./UpdatedBadge";
import { contentKeyLabel, formatShortDate } from "./funnel-admin-format";

export type ContentKeyInfo = {
  key: string;
  label?: string;
  subjectPreview?: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  isOverridden?: boolean;
  /** Optional raw copy for this key (override if set, else its code default). */
  subject?: string | null;
  body?: string | null;
  applyTag?: string | null;
};

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
  // Funnels v2 fields; absent on the older API.
  slot?: "base" | "module" | "urgency";
  contentKeys?: ContentKeyInfo[];
  updatedAt?: string | null;
  updatedBy?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

type PatchResponse = { ok?: boolean; migrationPending?: boolean; error?: string };

type Draft = { subject: string; body: string; applyTag: string };

const LABEL = "text-xs font-semibold uppercase tracking-wide text-slate-500";
const INPUT_BASE =
  "mt-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-500";
const INPUT = `${INPUT_BASE} w-full`;

/** The tabs to show: the API's content keys, or just the bare tier on the old API. */
function tabsFor(step: FunnelStep): ContentKeyInfo[] {
  const keys = (step.contentKeys ?? []).filter((k) => k && typeof k.key === "string");
  if (keys.length === 0) {
    return [
      {
        key: step.tier,
        label: "Base",
        subjectPreview: step.subjectPreview,
        updatedAt: step.updatedAt ?? null,
        updatedBy: step.updatedBy ?? null,
        isOverridden: step.isOverridden,
      },
    ];
  }
  // Bare tier first, whatever order the API used.
  const bare = keys.filter((k) => k.key === step.tier);
  const rest = keys.filter((k) => k.key !== step.tier);
  return bare.length > 0 ? [...bare, ...rest] : [{ key: step.tier, label: "Base" }, ...rest];
}

function initialDraft(step: FunnelStep, info: ContentKeyInfo): Draft {
  if (info.key === step.tier) {
    return { subject: step.subject, body: step.body, applyTag: step.apply_tag ?? "" };
  }
  return {
    subject: info.subject ?? "",
    body: info.body ?? "",
    applyTag: info.applyTag ?? "",
  };
}

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
  const uid = useId();
  const tabs = tabsFor(step);
  const hasTabs = tabs.length > 1;
  const [activeKey, setActiveKey] = useState(tabs[0].key);
  const active = tabs.find((t) => t.key === activeKey) ?? tabs[0];
  const isBare = active.key === step.tier;

  const [drafts, setDrafts] = useState<Record<string, Draft>>(() => {
    const out: Record<string, Draft> = {};
    for (const t of tabs) out[t.key] = initialDraft(step, t);
    return out;
  });
  const draft = drafts[active.key] ?? initialDraft(step, active);
  const [dayOffset, setDayOffset] = useState(String(step.day_offset));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function setField(field: keyof Draft, value: string) {
    setDrafts((prev) => ({
      ...prev,
      [active.key]: { ...(prev[active.key] ?? initialDraft(step, active)), [field]: value },
    }));
  }

  async function patch(payload: Record<string, unknown>, verb: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setNotice(null);
    setMigrationPending(null);
    try {
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
      const migrationFile =
        payload.action === "mark-reviewed"
          ? "20261110_funnels_v2_measure.sql"
          : "20260819_funnel_overrides.sql";
      if (!res.ok) {
        if (json.migrationPending || res.status === 409) {
          setMigrationPending(migrationFile);
          return false;
        }
        if (res.status === 403) {
          setError("You need the marketing.send permission to edit.");
          return false;
        }
        setError(json.error ?? `Could not ${verb} (HTTP ${res.status}).`);
        return false;
      }
      if (json.migrationPending) {
        setMigrationPending(migrationFile);
        return false;
      }
      return true;
    } catch {
      setError("Network error. Please retry.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(action: "save" | "reset") {
    const payload =
      action === "save"
        ? {
            funnel: funnelKey,
            tier: active.key,
            action,
            subject: draft.subject,
            body: draft.body,
            applyTag: draft.applyTag,
            ...(isBare ? { dayOffset: dayOffset.trim() === "" ? null : Number(dayOffset) } : {}),
          }
        : { funnel: funnelKey, tier: active.key, action };
    const ok = await patch(payload, `${action} this step`);
    if (!ok) return;
    onSaved();
    if (!hasTabs) {
      onClose();
      return;
    }
    if (action === "reset") {
      setDrafts((prev) => ({ ...prev, [active.key]: { subject: "", body: "", applyTag: "" } }));
      setNotice(`${active.label || contentKeyLabel(active.key)} reset to the default copy.`);
    } else {
      setNotice(`${active.label || contentKeyLabel(active.key)} saved.`);
    }
  }

  async function markReviewed() {
    const ok = await patch({ funnel: funnelKey, tier: step.tier, action: "mark-reviewed" }, "mark this step reviewed");
    if (!ok) return;
    setNotice("Marked reviewed.");
    onSaved();
  }

  function appendVar(name: string) {
    setField("body", `${draft.body}{{${name}}}`);
  }

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const key = tabs[next].key;
    setActiveKey(key);
    setNotice(null);
    tabRefs.current[key]?.focus();
  }

  // Modal focus management (WCAG 2.4.3 / 2.1.2): move focus into the dialog
  // on open, keep Tab inside it, close on Escape, and hand focus back to
  // whatever opened it on close.
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.focus();
    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    function onKey(e: globalThis.KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === first || current === dialog || !dialog.contains(current))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (current === last || !dialog.contains(current))) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  const tabId = (key: string) => `${uid}-tab-${key.replace(/[^a-z0-9_-]/gi, "_")}`;
  const panelId = `${uid}-panel`;
  const fieldId = (name: string) => `${uid}-${name}`;
  const activeOverridden = isBare ? step.isOverridden : !!active.isOverridden;
  const activeLabel = active.label || contentKeyLabel(active.key);
  const reviewedDate = formatShortDate(step.reviewedAt);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-title`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-slate-500">{funnelKey}</span>
              {step.isOverridden ? (
                <span className="inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  edited
                </span>
              ) : null}
              {step.updatedAt !== undefined ? (
                <UpdatedBadge updatedAt={step.updatedAt} updatedBy={step.updatedBy} />
              ) : null}
            </div>
            <h2 id={`${uid}-title`} className="mt-2 text-lg font-semibold text-slate-900">
              {funnelName}: {step.label}
            </h2>
            {step.reviewedAt !== undefined ? (
              <p className="mt-0.5 text-xs text-slate-500">
                {reviewedDate
                  ? `Last reviewed ${reviewedDate}${step.reviewedBy ? ` by ${step.reviewedBy}` : ""}`
                  : "Not reviewed yet"}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {stats ? (
          <p className="mt-1 text-xs text-slate-500">
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
            Apply the {migrationPending} migration to save this.
          </div>
        ) : null}

        {hasTabs ? (
          <div className="mt-4">
            <div
              role="tablist"
              aria-label="Copy version"
              className="flex flex-wrap gap-1 border-b border-slate-200"
            >
              {tabs.map((t, i) => {
                const selected = t.key === active.key;
                const overridden = t.key === step.tier ? step.isOverridden : !!t.isOverridden;
                return (
                  <button
                    key={t.key}
                    ref={(el) => {
                      tabRefs.current[t.key] = el;
                    }}
                    id={tabId(t.key)}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={panelId}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => {
                      setActiveKey(t.key);
                      setNotice(null);
                    }}
                    onKeyDown={(e) => onTabKeyDown(e, i)}
                    className={`-mb-px rounded-t-lg border px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                      selected
                        ? "border-slate-200 border-b-white bg-white text-indigo-700"
                        : "border-transparent text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    {t.key === step.tier ? "Base" : t.label || contentKeyLabel(t.key)}
                    {overridden ? <span className="ml-1 text-indigo-700">(edited)</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          id={panelId}
          role={hasTabs ? "tabpanel" : undefined}
          aria-labelledby={hasTabs ? tabId(active.key) : undefined}
        >
          {hasTabs ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono">{active.key}</span>
              {active.updatedAt !== undefined ? (
                <UpdatedBadge updatedAt={active.updatedAt} updatedBy={active.updatedBy} variant="inline" />
              ) : null}
            </div>
          ) : null}
          {hasTabs && !isBare ? (
            <p className="mt-1 text-xs text-slate-500">
              Only people on this track get this version. Leave a field blank to fall back to the
              tailored default, then the Base copy.
              {active.subjectPreview ? ` Current subject: "${active.subjectPreview}".` : ""}
            </p>
          ) : null}

          {isBare ? (
            <div className="mt-3">
              <label htmlFor={fieldId("day")} className={LABEL}>
                Timing (days after the funnel starts)
              </label>
              <input
                id={fieldId("day")}
                type="number"
                min={0}
                max={365}
                value={dayOffset}
                onChange={(e) => setDayOffset(e.target.value)}
                readOnly={!canEdit}
                disabled={!canEdit}
                className={`${INPUT_BASE} w-28`}
              />
              <p className="mt-1 text-xs text-slate-500">
                Whole days after the anchor (trial start, cancellation, etc.). Takes effect on the next
                cron run. The very first touch normally sends within minutes: leave it at 0.
                {hasTabs ? " Timing applies to every tab of this step." : ""}
              </p>
            </div>
          ) : null}

          <div className="mt-5">
            <label htmlFor={fieldId("subject")} className={LABEL}>
              Subject{hasTabs ? ` (${activeLabel})` : ""}
            </label>
            <input
              id={fieldId("subject")}
              type="text"
              value={draft.subject}
              onChange={(e) => setField("subject", e.target.value)}
              readOnly={!canEdit}
              disabled={!canEdit}
              placeholder={!isBare && active.subjectPreview ? active.subjectPreview : undefined}
              className={INPUT}
            />
          </div>

          <div className="mt-4">
            <label htmlFor={fieldId("body")} className={LABEL}>
              Body{hasTabs ? ` (${activeLabel})` : ""}
            </label>
            <textarea
              id={fieldId("body")}
              value={draft.body}
              onChange={(e) => setField("body", e.target.value)}
              readOnly={!canEdit}
              disabled={!canEdit}
              rows={16}
              placeholder={!isBare ? "Blank: uses the default copy for this track." : undefined}
              className={`${INPUT} font-mono`}
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
            <label htmlFor={fieldId("tag")} className={LABEL}>
              Tag on send
            </label>
            <input
              id={fieldId("tag")}
              type="text"
              value={draft.applyTag}
              onChange={(e) => setField("applyTag", e.target.value)}
              readOnly={!canEdit}
              disabled={!canEdit}
              placeholder="e.g. trial-day3"
              className={INPUT}
            />
            <p className="mt-1 text-xs text-slate-500">
              Adds this tag to everyone who gets this email, on top of existing tags.
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-3 text-sm text-emerald-700">
            {notice}
          </p>
        ) : null}

        {canEdit ? (
          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => void submit("save")}
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {busy ? "Saving..." : hasTabs ? `Save ${activeLabel}` : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (window.confirm(`Reset ${hasTabs ? activeLabel : "this step"} back to the built-in default copy?`)) {
                  void submit("reset");
                }
              }}
              disabled={busy || !activeOverridden}
              title={activeOverridden ? "Clear the override and use the code default" : "No override to reset"}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Reset to default
            </button>
            {step.reviewedAt !== undefined || step.contentKeys !== undefined ? (
              <button
                type="button"
                onClick={() => void markReviewed()}
                disabled={busy}
                title="Record that you checked this step's copy (all tabs) without changing it"
                className="ml-auto rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-40"
              >
                Mark reviewed
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
