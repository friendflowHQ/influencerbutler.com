"use client";

// Sequences tab of the admin Emails page: multi-step drip sequences with
// triggers (manual, tag-added, signup source), per-step engagement stats,
// manual enrollment, and a step editor.

import { useCallback, useEffect, useState } from "react";

import FunnelStepEditor, { type FunnelStep } from "./FunnelStepEditor";
import SequenceStepDrawer, { DEFAULT_TEST_EMAIL } from "./SequenceStepDrawer";

type Trigger = null | { kind: "tag_added"; tag: string } | { kind: "source"; source: string };

type SystemFunnel = {
  funnel: string;
  name: string;
  description: string;
  tooltip?: string;
  vars: string[];
  entered: number | null;
  converted: number | null;
  convertedLabel: string | null;
  steps: FunnelStep[];
};

type SystemSequencesResponse = {
  funnels: SystemFunnel[];
  unsubscribes: number;
  migrationPending: boolean;
};

type EditingFunnelStep = {
  funnel: string;
  funnelName: string;
  vars: string[];
  step: FunnelStep;
};

type SequenceStep = {
  id: string;
  position: number;
  day_offset: number;
  subject: string;
  body: string;
  category: string;
  // Open enrollments whose next step is this one (waiting to be sent it).
  queued: number;
  // Conversions attributed last-touch to this step (recipient became a live
  // subscriber after receiving it).
  converted: number;
};

type Sequence = {
  id: string;
  name: string;
  status: "active" | "paused";
  trigger: Trigger;
  sends_per_hour: number | null;
  send_hour: number | null;
  track_opens: boolean;
  auto_paused_at: string | null;
  pause_reason: string | null;
  created_at: string;
  steps: SequenceStep[];
  enrollmentCounts: { active: number; completed: number; cancelled: number };
  // Soonest next send across open enrollments (ISO), or null when none pending.
  next_send_at: string | null;
  // Total conversions (became a live subscriber) across the whole sequence.
  convertedTotal: number;
  // All-time emails sent across the whole sequence (summed over its steps).
  sentTotal: number;
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

/** "9:00 AM MT" style label for a fixed send hour (0-23), else null. */
function sendHourLabel(hour: number | null): string | null {
  if (hour == null || !Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  const period = hour < 12 ? "AM" : "PM";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:00 ${period} MT`;
}

// The cron's fallback rate when a sequence has no explicit sends_per_hour
// (mirrors DEFAULT_SENDS_PER_HOUR in src/lib/email-marketing.ts). Used only so
// the drain estimate is never divided by zero.
const DEFAULT_RATE = 120;

/** True when an ISO next-send time is due now or overdue (within a minute). */
function isDueNow(iso: string | null): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t <= Date.now() + 60_000;
}

/** "now" when due/overdue, else a short "Sep 3, 9:00 AM" style label; "-" if none. */
function nextSendLabel(iso: string | null): string {
  if (!iso) return "-";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "-";
  if (t <= Date.now() + 60_000) return "now";
  return new Date(t).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Rough time to clear `active` open enrollments at this sequence's rate/hour.
 * Throttle-bound and optimistic: the real pace also depends on the shared
 * domain-safe hourly headroom, so this is an upper bound on speed, not a promise.
 */
function drainLabel(active: number, rate: number | null): string {
  if (active <= 0) return "-";
  const perHour = rate && rate > 0 ? rate : DEFAULT_RATE;
  const hours = active / perHour;
  if (hours < 1) return "< 1 hr";
  if (hours < 48) return `~${Math.round(hours)} hr`;
  return `~${Math.round(hours / 24)} days`;
}

/**
 * Sequence-level conversion readout: total who became a live subscriber vs
 * everyone who ever entered (active + completed + cancelled). "-" when none yet.
 */
function convertedLabel(seq: Sequence): string {
  const total = seq.convertedTotal ?? 0;
  if (total <= 0) return "-";
  const entered =
    seq.enrollmentCounts.active + seq.enrollmentCounts.completed + seq.enrollmentCounts.cancelled;
  const rate = entered > 0 ? ` (${Math.round((total / entered) * 100)}%)` : "";
  return `${total.toLocaleString("en-US")}${rate}`;
}

/** All-time emails sent across the whole sequence; "-" when none yet. */
function sentLabel(seq: Sequence): string {
  const total = seq.sentTotal ?? 0;
  return total > 0 ? total.toLocaleString("en-US") : "-";
}

/** One compact, color-toned stat cell for the per-sequence readout band. */
function StatChip({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: string;
  tone: "indigo" | "slate" | "emerald" | "amber";
  title?: string;
}) {
  const tones: Record<typeof tone, string> = {
    indigo: "border-indigo-100 bg-indigo-50 text-indigo-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
    amber: "border-amber-100 bg-amber-50 text-amber-800",
  };
  return (
    <div className={`rounded-lg border px-3 py-2 ${tones[tone]}`} title={title}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

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

/** Longer how-to-enroll text for the info tooltip on a custom sequence card. */
function sequenceTooltip(t: Trigger): string {
  if (!t) {
    return "No auto-enroll trigger. Add people with the Enroll button (paste emails, or enroll everyone with a tag).";
  }
  if (t.kind === "tag_added") {
    return `Enroll a contact by importing them on the Contacts tab with the tag "${t.tag}", or by selecting contacts and choosing Tag. The sequence must be Active for auto-enroll; if you tag people while it is paused, activate it and then use Enroll > By tag to backfill.`;
  }
  return `Enrolls automatically when a new contact signs up with source "${t.source}" (checked over a 7-day window). The sequence must be Active.`;
}

/** Small info glyph with a native hover tooltip (repo has no icon library). */
function InfoDot({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="cursor-help select-none text-sm leading-none text-slate-400 transition hover:text-slate-600"
    >
      &#9432;
    </span>
  );
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
  onOpenCustomer,
  onOpenSend,
}: {
  summary: { categories: SummaryCategory[] } | null;
  onOpenCustomer: (email: string) => void;
  onOpenSend: (sendId: string) => void;
}) {
  const [data, setData] = useState<SequencesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  // Built-in funnels (system sequences)
  const [systemData, setSystemData] = useState<SystemSequencesResponse | null>(null);
  const [systemError, setSystemError] = useState<string | null>(null);
  const [editingFunnelStep, setEditingFunnelStep] = useState<EditingFunnelStep | null>(null);

  // Editor state
  const [editing, setEditing] = useState<null | "new" | Sequence>(null);
  const [name, setName] = useState("");
  const [triggerKind, setTriggerKind] = useState<"none" | "tag_added" | "source">("none");
  const [triggerTag, setTriggerTag] = useState("");
  const [triggerSource, setTriggerSource] = useState("");
  const [sendsPerHour, setSendsPerHour] = useState("");
  const [sendHour, setSendHour] = useState("");
  const [trackOpens, setTrackOpens] = useState(false);
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

  // Step drill-down drawer (which step of which sequence is open).
  const [openStep, setOpenStep] = useState<{ sequenceId: string; position: number } | null>(null);

  // Test All panel state (one open at a time, keyed by sequence id). Sends every
  // step of the funnel now to a test address, ignoring drip schedule,
  // subscription/suppression status, and the hourly send limit.
  const [testOpenId, setTestOpenId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState(DEFAULT_TEST_EMAIL);
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

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

  const refetchSystem = useCallback(async () => {
    setSystemError(null);
    try {
      const res = await fetch("/api/admin/emails/system-sequences", { cache: "no-store" });
      if (!res.ok) {
        setSystemError(`Could not load built-in funnels (HTTP ${res.status}).`);
        return;
      }
      setSystemData((await res.json()) as SystemSequencesResponse);
    } catch {
      setSystemError("Could not load built-in funnels. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    void refetch();
    void refetchSystem();
  }, [refetch, refetchSystem]);

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
      setSendsPerHour("");
      setSendHour("");
      setTrackOpens(false);
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
      setSendsPerHour(seq.sends_per_hour != null ? String(seq.sends_per_hour) : "");
      setSendHour(seq.send_hour != null ? String(seq.send_hour) : "");
      setTrackOpens(Boolean(seq.track_opens));
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
      // Empty field clears the cap (use default rate); a number sets the throttle.
      const ratePayload = sendsPerHour.trim() === "" ? null : Number(sendsPerHour);
      // Empty clears the fixed hour (send at each person's enrollment minute).
      const hourPayload = sendHour.trim() === "" ? null : Number(sendHour);
      const res =
        editing === "new"
          ? await fetch("/api/admin/emails/sequences", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name,
                trigger: trigger ?? undefined,
                steps: payloadSteps,
                sendsPerHour: ratePayload,
                sendHour: hourPayload,
                trackOpens,
              }),
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
                sendsPerHour: ratePayload,
                sendHour: hourPayload,
                trackOpens,
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

  async function stopSequence(seq: Sequence) {
    const active = seq.enrollmentCounts.active;
    if (
      !window.confirm(
        `Stop "${seq.name}"? This pauses it and cancels ${active.toLocaleString("en-US")} pending ` +
          `enrollment(s) so no one mid-drip gets another email. People already finished are unaffected.`,
      )
    ) {
      return;
    }
    setListError(null);
    try {
      const res = await fetch("/api/admin/emails/sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seq.id, action: "stop" }),
      });
      if (!res.ok) {
        setListError(await readError(res, "Could not stop the sequence"));
        return;
      }
      void refetch();
    } catch {
      setListError("Could not stop the sequence. Check your connection and try again.");
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
      const body = (await res.json()) as {
        ok: boolean;
        inserted?: number;
        reactivated?: number;
        skipped?: number;
        capped?: number;
      };
      const parts: string[] = [];
      if (body.inserted) parts.push(`${body.inserted} enrolled`);
      if (body.reactivated) parts.push(`${body.reactivated} reactivated`);
      if (body.skipped) parts.push(`${body.skipped} already active`);
      let summary = parts.length ? parts.join(", ") : "No changes (all already active)";
      if (body.capped) summary += ` (${body.capped} over the 50,000 limit not enrolled)`;
      setEnrollResult(summary);
      setEnrollText("");
      setEnrollTag("");
      void refetch();
    } catch {
      setEnrollError("Enrollment failed. Check your connection and try again.");
    } finally {
      setEnrollBusy(false);
    }
  }

  async function submitTestAll(seq: Sequence) {
    const to = testEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      setTestError("Enter a valid email address.");
      setTestResult(null);
      return;
    }
    setTestBusy(true);
    setTestError(null);
    setTestResult(null);
    try {
      const res = await fetch("/api/admin/emails/sequences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: seq.id, action: "test-all", toEmail: to }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        sent?: number;
        total?: number;
        error?: string;
      };
      if (!res.ok) {
        setTestError(body.error ?? `Could not send the test (HTTP ${res.status}).`);
        return;
      }
      const sent = body.sent ?? 0;
      const total = body.total ?? sent;
      setTestResult(
        sent === total
          ? `Sent all ${total} step(s) to ${to}.`
          : `Sent ${sent} of ${total} step(s) to ${to} (some failed).`,
      );
    } catch {
      setTestError("Could not send the test. Check your connection and try again.");
    } finally {
      setTestBusy(false);
    }
  }

  function stepStats(step: SequenceStep): string {
    const queuedPart =
      step.queued > 0 ? `${step.queued.toLocaleString("en-US")} queued` : "";
    // Conversions (became a live subscriber) attributed last-touch to this step.
    // Shown as a % of this step's sends when we have a send count for the window,
    // else as a raw count (conversions can predate the summary window).
    const cat = summary?.categories.find((c) => c.key === step.category);
    const convPart =
      step.converted > 0
        ? cat && cat.sent > 0
          ? `${step.converted.toLocaleString("en-US")} conv (${pct(step.converted, cat.sent)})`
          : `${step.converted.toLocaleString("en-US")} conv`
        : "";
    if (!cat) return [queuedPart, convPart].filter(Boolean).join(" / ") || "-";
    const base = Math.max(cat.delivered, cat.sent);
    const counts = [`${cat.sent.toLocaleString("en-US")} sent`, queuedPart]
      .filter(Boolean)
      .join(", ");
    const tail = [`${pct(cat.opened, base)} open`, `${pct(cat.clicked, base)} click`, convPart]
      .filter(Boolean)
      .join(" / ");
    return `${counts} / ${tail}`;
  }

  // Same open%/click% shape as stepStats, joined by the funnel step's category.
  function funnelStepStats(
    category: string,
  ): { text: string; stats?: { sent: number; openPct: string; clickPct: string } } {
    const cat = summary?.categories.find((c) => c.key === category);
    if (!cat) return { text: "-" };
    const base = Math.max(cat.delivered, cat.sent);
    const openPct = pct(cat.opened, base);
    const clickPct = pct(cat.clicked, base);
    return {
      text: `${cat.sent.toLocaleString("en-US")} sent / ${openPct} open / ${clickPct} click`,
      stats: { sent: cat.sent, openPct, clickPct },
    };
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

          <div className="mt-3 max-w-xs">
            <label className="text-xs font-medium text-slate-500">Send rate (emails/hour)</label>
            <input
              type="number"
              min={1}
              max={5000}
              value={sendsPerHour}
              onChange={(e) => setSendsPerHour(e.target.value)}
              placeholder="No limit"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">
              Throttles this drip to protect your sending domain. Leave blank for no per-sequence
              limit. For a cold or old list, start low (e.g. 20-50/hour) and raise it over a few days
              while bounces stay healthy.
            </p>
          </div>

          <div className="mt-3 max-w-xs">
            <label className="text-xs font-medium text-slate-500">Send at (hour, Mountain Time)</label>
            <select
              value={sendHour}
              onChange={(e) => setSendHour(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 focus:border-indigo-300 focus:outline-none"
            >
              <option value="">Any time (when each person enrolled)</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {sendHourLabel(h)}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Day offsets count from each person&apos;s enrollment. With a fixed hour, a step lands
              at that hour on its due day instead of the exact minute they enrolled. Leave on &quot;Any
              time&quot; to send as soon as the offset elapses.
            </p>
          </div>

          <div className="mt-3 max-w-md">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={trackOpens}
                onChange={(e) => setTrackOpens(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-300"
              />
              <span className="text-sm text-slate-800">Track opens and clicks</span>
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Off by default: steps send as plain text (best deliverability), and only delivered /
              bounced are recorded. Turn on to also send an HTML copy so Resend can record opens and
              clicks. It adds a tracking pixel, a small deliverability tradeoff on cold lists.
            </p>
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

      {/* ----- Built-in funnels ----- */}
      <div className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Built-in funnels
          </h2>
          {systemData ? (
            <span className="text-xs text-slate-500">
              {systemData.unsubscribes.toLocaleString("en-US")} total unsubscribes across all email
              (global, not per-funnel).
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-slate-500">
          Your automated funnels. Click a step to view or edit its copy.
        </p>

        {systemError ? <p className="mt-3 text-sm text-rose-600">{systemError}</p> : null}

        {systemData?.migrationPending ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Apply 20260819_funnel_overrides.sql to edit built-in funnel copy. Funnels still display
            with code defaults below.
          </div>
        ) : null}

        <div className="mt-3 space-y-4">
          {(systemData?.funnels ?? []).map((funnel) => (
            <div key={funnel.funnel} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-slate-800">{funnel.name}</h3>
                {funnel.tooltip ? <InfoDot text={funnel.tooltip} /> : null}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  System
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">{funnel.description}</p>
              {funnel.entered != null ? (
                <p className="mt-0.5 text-xs text-slate-500">
                  {funnel.entered.toLocaleString("en-US")} entered
                  {funnel.converted != null
                    ? ` / ${funnel.converted.toLocaleString("en-US")} ${funnel.convertedLabel ?? "converted"}`
                    : ""}
                </p>
              ) : null}

              <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
                {funnel.steps.map((step) => {
                  const s = funnelStepStats(step.category);
                  return (
                    <button
                      key={step.tier}
                      type="button"
                      onClick={() =>
                        setEditingFunnelStep({
                          funnel: funnel.funnel,
                          funnelName: funnel.name,
                          vars: funnel.vars,
                          step,
                        })
                      }
                      className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 flex-1 truncate text-slate-700">
                        {step.isOverridden ? (
                          <span
                            className="mr-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-indigo-500 align-middle"
                            title="Customized copy"
                          />
                        ) : null}
                        <span className="font-medium">{step.label}:</span> {step.subjectPreview}
                      </span>
                      <span className="text-xs text-slate-500">{s.text}</span>
                    </button>
                  );
                })}
                {funnel.steps.length === 0 ? (
                  <p className="text-sm text-slate-500">No steps.</p>
                ) : null}
              </div>
            </div>
          ))}
          {!systemData && !systemError ? (
            <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
          ) : null}
        </div>
      </div>

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
                  <InfoDot text={sequenceTooltip(seq.trigger)} />
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
                <p className="mt-0.5 text-xs text-slate-500">
                  {triggerLabel(seq.trigger)}
                  {seq.sends_per_hour != null
                    ? ` - throttled to ${seq.sends_per_hour.toLocaleString("en-US")}/hour`
                    : ""}
                </p>
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
                <button
                  type="button"
                  onClick={() => {
                    setTestOpenId((prev) => (prev === seq.id ? null : seq.id));
                    setTestResult(null);
                    setTestError(null);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                  title="Send every step of this funnel to a test address now, ignoring the schedule and sending limits"
                >
                  Test All
                </button>
                {seq.enrollmentCounts.active > 0 ? (
                  <button
                    type="button"
                    onClick={() => void stopSequence(seq)}
                    className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                    title="Pause the sequence and cancel everyone still mid-drip"
                  >
                    Stop &amp; cancel pending
                  </button>
                ) : null}
              </div>
            </div>

            {seq.auto_paused_at ? (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <span className="font-semibold">Auto-paused to protect your domain.</span>{" "}
                {seq.pause_reason ?? "Bounce or complaint rate crossed the safe threshold."} Review
                the list, then Activate to resume.
              </div>
            ) : null}

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <StatChip
                label="Rate"
                value={`${(seq.sends_per_hour ?? DEFAULT_RATE).toLocaleString("en-US")}/hr`}
                tone="indigo"
                title="How fast this sequence is allowed to drip, per hour."
              />
              <StatChip
                label="Waiting"
                value={seq.enrollmentCounts.active.toLocaleString("en-US")}
                tone="slate"
                title="Open enrollments still mid-drip (the backlog)."
              />
              <StatChip
                label="Next send"
                value={nextSendLabel(seq.next_send_at)}
                tone={isDueNow(seq.next_send_at) ? "emerald" : "slate"}
                title={
                  seq.send_hour != null
                    ? `Pinned to ${sendHourLabel(seq.send_hour)}. Clear the send hour (Edit) to start sending on the next cron run instead.`
                    : "Soonest upcoming send across everyone still mid-drip."
                }
              />
              <StatChip
                label="Est. drain"
                value={drainLabel(seq.enrollmentCounts.active, seq.sends_per_hour)}
                tone="amber"
                title="Rough time to clear the backlog at this rate. Real pace also depends on the shared domain-safe hourly limit, so treat it as a best case."
              />
              <StatChip
                label="Sent"
                value={sentLabel(seq)}
                tone="slate"
                title="Total emails this sequence has ever sent, across all steps (all-time). The per-step counts below follow the 7/30/90-day window selector instead."
              />
              <StatChip
                label="Converted"
                value={convertedLabel(seq)}
                tone="emerald"
                title="People who became a live subscriber (trial or paid) after entering this sequence, as a share of everyone who entered. This is the payoff signal: higher means the sequence is working."
              />
            </div>

            <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
              {[...seq.steps]
                .sort((a, b) => a.position - b.position)
                .map((step, i) => (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() =>
                      setOpenStep({ sequenceId: seq.id, position: step.position })
                    }
                    className="flex w-full flex-wrap items-baseline justify-between gap-2 rounded-lg px-2 py-1 text-left text-sm transition hover:bg-slate-50"
                    title="View this step: copy, who opened/clicked, and who is scheduled"
                  >
                    <span className="min-w-0 flex-1 truncate text-slate-700">
                      <span className="font-medium">
                        Step {i + 1} (day {step.day_offset}
                        {sendHourLabel(seq.send_hour) ? `, ${sendHourLabel(seq.send_hour)}` : ""}):
                      </span>{" "}
                      {step.subject}
                    </span>
                    <span className="text-xs text-slate-500">{stepStats(step)}</span>
                  </button>
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

            {testOpenId === seq.id ? (
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-medium text-slate-700">
                  Send all {seq.steps.length} step(s) now
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Delivers every email in this funnel immediately, regardless of subscription status,
                  and does not use the hourly or daily sending limits. A real recipient gets them
                  spread over days; a test gets them all at once.
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => {
                      setTestEmail(e.target.value);
                      setTestResult(null);
                      setTestError(null);
                    }}
                    placeholder="you@example.com"
                    className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void submitTestAll(seq)}
                    disabled={testBusy || seq.steps.length === 0}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {testBusy ? "Sending..." : "Send test of all steps"}
                  </button>
                  {testResult ? (
                    <span className="text-sm text-emerald-700">{testResult}</span>
                  ) : null}
                  {testError ? <span className="text-sm text-rose-600">{testError}</span> : null}
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

      {openStep ? (
        <SequenceStepDrawer
          sequenceId={openStep.sequenceId}
          position={openStep.position}
          onClose={() => setOpenStep(null)}
          onOpenCustomer={onOpenCustomer}
          onOpenSend={onOpenSend}
        />
      ) : null}

      {editingFunnelStep ? (
        <FunnelStepEditor
          funnelKey={editingFunnelStep.funnel}
          funnelName={editingFunnelStep.funnelName}
          funnelVars={editingFunnelStep.vars}
          step={editingFunnelStep.step}
          canEdit={true}
          stats={funnelStepStats(editingFunnelStep.step.category).stats}
          onClose={() => setEditingFunnelStep(null)}
          onSaved={() => {
            void refetchSystem();
          }}
        />
      ) : null}
    </section>
  );
}
