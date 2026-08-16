"use client";

// Sequences tab of the admin Emails page: multi-step drip sequences with
// triggers (manual, tag-added, signup source), per-step engagement stats,
// manual enrollment, and a step editor.

import { useCallback, useEffect, useState } from "react";

type Trigger = null | { kind: "tag_added"; tag: string } | { kind: "source"; source: string };

type SequenceStep = {
  id: string;
  position: number;
  day_offset: number;
  subject: string;
  body: string;
  category: string;
};

type Sequence = {
  id: string;
  name: string;
  status: "active" | "paused";
  trigger: Trigger;
  created_at: string;
  steps: SequenceStep[];
  enrollmentCounts: { active: number; completed: number; cancelled: number };
};

type SequencesResponse = { sequences: Sequence[]; migrationPending: boolean };

type SummaryCategory = {
  key: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
};

type EditableStep = { dayOffset: number; subject: string; body: string };

const SOURCE_SUGGESTIONS = [
  "site",
  "footer",
  "course",
  "download-app",
  "course-amazon-influencer",
  "manual-import",
];

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return "-";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function triggerLabel(t: Trigger): string {
  if (!t) return "Manual enrollment only";
  if (t.kind === "tag_added") return `Auto-enrolls when tag ${t.tag} is added`;
  return `Auto-enrolls signups from source ${t.source}`;
}

function parseEmails(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,;]+/)
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@")),
    ),
  );
}

export default function SequencesSection({
  summary,
}: {
  summary: { categories: SummaryCategory[] } | null;
}) {
  const [data, setData] = useState<SequencesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Editor state
  const [editing, setEditing] = useState<null | "new" | Sequence>(null);
  const [name, setName] = useState("");
  const [triggerKind, setTriggerKind] = useState<"none" | "tag_added" | "source">("none");
  const [triggerTag, setTriggerTag] = useState("");
  const [triggerSource, setTriggerSource] = useState("");
  const [steps, setSteps] = useState<EditableStep[]>([]);
  const [editorBusy, setEditorBusy] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  // Enroll panel state (one open at a time, keyed by sequence id)
  const [enrollOpenId, setEnrollOpenId] = useState<string | null>(null);
  const [enrollMode, setEnrollMode] = useState<"paste" | "tag">("paste");
  const [enrollText, setEnrollText] = useState("");
  const [enrollTag, setEnrollTag] = useState("");
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [enrollResult, setEnrollResult] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/emails/sequences", { cache: "no-store" });
      if (!res.ok) {
        setLoadError(`Could not load sequences (HTTP ${res.status}).`);
        return;
      }
      setData((await res.json()) as SequencesResponse);
    } catch {
      setLoadError("Could not load sequences. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  async function readError(res: Response, fallback: string): Promise<string> {
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) return body.error;
    } catch {
      // fall through to the generic message
    }
    return `${fallback} (HTTP ${res.status}).`;
  }

  function openEditor(seq: "new" | Sequence) {
    setEditing(seq);
    setEditorError(null);
    if (seq === "new") {
      setName("");
      setTriggerKind("none");
      setTriggerTag("");
      setTriggerSource("");
      setSteps([{ dayOffset: 0, subject: "", body: "" }]);
    } else {
      setName(seq.name);
      if (!seq.trigger) {
        setTriggerKind("none");
        setTriggerTag("");
        setTriggerSource("");
      } else if (seq.trigger.kind === "tag_added") {
        setTriggerKind("tag_added");
        setTriggerTag(seq.trigger.tag);
        setTriggerSource("");
      } else {
        setTriggerKind("source");
        setTriggerSource(seq.trigger.source);
        setTriggerTag("");
      }
      setSteps(
        [...seq.steps]
          .sort((a, b) => a.position - b.position)
          .map((s) => ({ dayOffset: s.day_offset, subject: s.subject, body: s.body })),
      );
    }
  }

  function buildTrigger(): Trigger {
    if (triggerKind === "tag_added") return { kind: "tag_added", tag: triggerTag.trim() };
    if (triggerKind === "source") return { kind: "source", source: triggerSource.trim() };
    return null;
  }

  const offsetsOutOfOrder = steps.some((s, i) => i > 0 && s.dayOffset < steps[i - 1].dayOffset);

  async function saveSequence() {
    if (offsetsOutOfOrder) {
      setEditorError("Day offsets must not decrease from one step to the next.");
      return;
    }
    setEditorBusy(true);
    setEditorError(null);
    try {
      const payloadSteps = steps.map((s) => ({
        dayOffset: s.dayOffset,
        subject: s.subject,
        body: s.body,
      }));
      const trigger = buildTrigger();
      const res =
        editing === "new"
          ? await fetch("/api/admin/emails/sequences", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name, trigger: trigger ?? undefined, steps: payloadSteps }),
            })
          : await fetch("/api/admin/emails/sequences", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: (editing as Sequence).id,
                action: "update",
                name,
                trigger,
                steps: payloadSteps,
              }),
            });
      if (!res.ok) {
        setEditorError(await readError(res, "Could not save the sequence"));
        return;
      }
      setEditing(null);
      void refetch();
    } catch {
      setEditorError("Could not save the sequence. Check your connection and try again.");
    } finally {
      setEditorBusy(false);
    }
  }

  async function toggleStatus(seq: Sequence) {
    setListError(null);
    try {
      const res = await fetch("/api/admin/emails/sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seq.id, action: seq.status === "active" ? "pause" : "activate" }),
      });
      if (!res.ok) {
        setListError(await readError(res, "Could not update the sequence"));
        return;
      }
      void refetch();
    } catch {
      setListError("Could not update the sequence. Check your connection and try again.");
    }
  }

  async function submitEnroll(seq: Sequence) {
    setEnrollBusy(true);
    setEnrollError(null);
    setEnrollResult(null);
    try {
      const payload: { id: string; action: "enroll"; emails?: string[]; tag?: string } = {
        id: seq.id,
        action: "enroll",
      };
      if (enrollMode === "paste") {
        const emails = parseEmails(enrollText);
        if (emails.length === 0) {
          setEnrollError("Paste at least one email address.");
          return;
        }
        payload.emails = emails;
      } else {
        if (!enrollTag.trim()) {
          setEnrollError("Enter a tag.");
          return;
        }
        payload.tag = enrollTag.trim();
      }
      const res = await fetch("/api/admin/emails/sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setEnrollError(await readError(res, "Enrollment failed"));
        return;
      }
      const body = (await res.json()) as { ok: boolean; enrolled?: number };
      setEnrollResult(`${body.enrolled ?? 0} people enrolled`);
      setEnrollText("");
      setEnrollTag("");
      void refetch();
    } catch {
      setEnrollError("Enrollment failed. Check your connection and try again.");
    } finally {
      setEnrollBusy(false);
    }
  }

  function stepStats(step: SequenceStep): string {
    const cat = summary?.categories.find((c) => c.key === step.category);
    if (!cat) return "-";
    const base = Math.max(cat.delivered, cat.sent);
    return `${cat.sent.toLocaleString("en-US")} sent / ${pct(cat.opened, base)} open / ${pct(cat.clicked, base)} click`;
  }

  // ----- Editor view -----
  if (editing !== null) {
    return (
      <section className="mt-6">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {editing === "new" ? "New sequence" : `Edit: ${editing.name}`}
          </h2>
          <button
            type="button"
            onClick={() => setEditing(null)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            Back
          </button>
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="text-xs font-medium text-slate-500">Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Course follow-up drip"
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500">Trigger</label>
              <select
                value={triggerKind}
                onChange={(e) => setTriggerKind(e.target.value as "none" | "tag_added" | "source")}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none"
              >
                <option value="none">Manual enrollment only</option>
                <option value="tag_added">When a tag is added</option>
                <option value="source">On signup from a source</option>
              </select>
            </div>
            <div>
              {triggerKind === "tag_added" ? (
                <>
                  <label className="text-xs font-medium text-slate-500">Tag</label>
                  <input
                    type="text"
                    value={triggerTag}
                    onChange={(e) => setTriggerTag(e.target.value)}
                    placeholder="vip"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                  />
                </>
              ) : null}
              {triggerKind === "source" ? (
                <>
                  <label className="text-xs font-medium text-slate-500">Source</label>
                  <input
                    type="text"
                    list="sequence-source-suggestions"
                    value={triggerSource}
                    onChange={(e) => setTriggerSource(e.target.value)}
                    placeholder="course"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                  />
                  <datalist id="sequence-source-suggestions">
                    {SOURCE_SUGGESTIONS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </>
              ) : null}
            </div>
          </div>

          <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Steps
          </h3>
          <div className="mt-2 space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-slate-500">Step {i + 1}</span>
                  <label className="flex items-center gap-1.5 text-xs text-slate-500">
                    Day
                    <input
                      type="number"
                      min={0}
                      max={365}
                      value={step.dayOffset}
                      onChange={(e) => {
                        const v = Math.max(0, Math.min(365, Number(e.target.value) || 0));
                        setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, dayOffset: v } : s)));
                      }}
                      className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none"
                    />
                  </label>
                  <input
                    type="text"
                    value={step.subject}
                    onChange={(e) =>
                      setSteps((prev) =>
                        prev.map((s, j) => (j === i ? { ...s, subject: e.target.value } : s)),
                      )
                    }
                    placeholder="Subject"
                    className="min-w-64 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setSteps((prev) => prev.filter((_, j) => j !== i))}
                    disabled={steps.length <= 1}
                    className="text-xs text-rose-600 underline underline-offset-2 hover:text-rose-500 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={step.body}
                  onChange={(e) =>
                    setSteps((prev) =>
                      prev.map((s, j) => (j === i ? { ...s, body: e.target.value } : s)),
                    )
                  }
                  rows={6}
                  placeholder="Email body..."
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                />
              </div>
            ))}
          </div>

          {offsetsOutOfOrder ? (
            <p className="mt-2 text-sm text-rose-600">
              Day offsets must not decrease: each step should send on the same day or later than
              the step before it.
            </p>
          ) : null}

          <div className="mt-3">
            <button
              type="button"
              onClick={() =>
                setSteps((prev) => [
                  ...prev,
                  {
                    dayOffset: prev.length > 0 ? prev[prev.length - 1].dayOffset : 0,
                    subject: "",
                    body: "",
                  },
                ])
              }
              disabled={steps.length >= 20}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              Add step
            </button>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => void saveSequence()}
              disabled={editorBusy}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
            >
              {editorBusy ? "Saving..." : editing === "new" ? "Create sequence" : "Save changes"}
            </button>
            {editing !== "new" ? (
              <p className="mt-2 text-xs text-slate-500">
                Editing steps affects people currently mid-sequence.
              </p>
            ) : null}
            {editorError ? <p className="mt-2 text-sm text-rose-600">{editorError}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  // ----- List view -----
  const sequences = data?.sequences ?? [];

  return (
    <section className="mt-6">
      {data?.migrationPending ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          The email marketing tables are missing. Apply
          supabase/migrations/20260817_email_marketing.sql to prod to enable contacts, campaigns,
          and sequences.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Sequences</h2>
        <button
          type="button"
          onClick={() => openEditor("new")}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
        >
          New sequence
        </button>
      </div>

      {loadError ? <p className="mt-3 text-sm text-rose-600">{loadError}</p> : null}
      {listError ? <p className="mt-3 text-sm text-rose-600">{listError}</p> : null}

      <div className="mt-3 space-y-4">
        {sequences.map((seq) => (
          <div key={seq.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-slate-800">{seq.name}</h3>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      seq.status === "active"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {seq.status}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{triggerLabel(seq.trigger)}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {seq.enrollmentCounts.active.toLocaleString("en-US")} active,{" "}
                  {seq.enrollmentCounts.completed.toLocaleString("en-US")} completed
                  {seq.enrollmentCounts.cancelled > 0
                    ? `, ${seq.enrollmentCounts.cancelled.toLocaleString("en-US")} cancelled`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void toggleStatus(seq)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  {seq.status === "active" ? "Pause" : "Activate"}
                </button>
                <button
                  type="button"
                  onClick={() => openEditor(seq)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEnrollOpenId((prev) => (prev === seq.id ? null : seq.id));
                    setEnrollResult(null);
                    setEnrollError(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                >
                  Enroll
                </button>
              </div>
            </div>

            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
              {[...seq.steps]
                .sort((a, b) => a.position - b.position)
                .map((step, i) => (
                  <div
                    key={step.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span className="text-slate-700">
                      <span className="font-medium">
                        Step {i + 1} (day {step.day_offset}):
                      </span>{" "}
                      {step.subject}
                    </span>
                    <span className="text-xs text-slate-500">{stepStats(step)}</span>
                  </div>
                ))}
              {seq.steps.length === 0 ? (
                <p className="text-sm text-slate-500">No steps yet.</p>
              ) : null}
            </div>

            {enrollOpenId === seq.id ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex gap-4 text-sm text-slate-700">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`enroll-mode-${seq.id}`}
                      checked={enrollMode === "paste"}
                      onChange={() => setEnrollMode("paste")}
                    />
                    Paste emails
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name={`enroll-mode-${seq.id}`}
                      checked={enrollMode === "tag"}
                      onChange={() => setEnrollMode("tag")}
                    />
                    By tag
                  </label>
                </div>
                {enrollMode === "paste" ? (
                  <textarea
                    value={enrollText}
                    onChange={(e) => setEnrollText(e.target.value)}
                    rows={4}
                    placeholder="Paste emails separated by commas, spaces, or new lines..."
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                  />
                ) : (
                  <input
                    type="text"
                    value={enrollTag}
                    onChange={(e) => setEnrollTag(e.target.value)}
                    placeholder="tag name"
                    className="mt-2 w-56 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                  />
                )}
                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void submitEnroll(seq)}
                    disabled={enrollBusy}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {enrollBusy ? "Enrolling..." : "Enroll"}
                  </button>
                  {enrollResult ? (
                    <span className="text-sm text-emerald-700">{enrollResult}</span>
                  ) : null}
                  {enrollError ? <span className="text-sm text-rose-600">{enrollError}</span> : null}
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {!loading && sequences.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No sequences yet. Create one to drip a series of emails over days or weeks.
          </div>
        ) : null}
        {loading ? <div className="h-24 animate-pulse rounded-xl bg-slate-100" /> : null}
      </div>
    </section>
  );
}
