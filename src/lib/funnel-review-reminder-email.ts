// Monthly email funnel review reminder, sent to the founder on the 1st of each
// month by /api/cron/funnel-review-reminder.
//
// Plain text only: Gmail filtered the HTML version of earlier admin digests, so
// this one never sends HTML. The body lists, in order:
//   1. stale funnels, funnel steps and sequences (oldest first) with the last
//      updated date and who changed it,
//   2. funnels below their activation or paid target,
//   3. A/B decisions from the last month, then running and stalled tests,
//   4. a price-change note while an announced change is still ahead,
//   5. a link to the admin Emails page.
//
// buildFunnelReviewReminder / buildFunnelReviewReminderBody are pure so they
// can be unit-tested; sendFunnelReviewReminder does the I/O.

import { sendEmail } from "@/lib/email-send";
import { transactionalFrom } from "@/lib/email-senders";
import { founderRecipients } from "@/lib/founder-recipient";

export const ADMIN_EMAILS_URL = "https://www.influencerbutler.com/dashboard/admin/emails";
export const FUNNEL_REVIEW_CATEGORY = "funnel_review_reminder";

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReviewStaleItem = {
  /** What this row is: a whole built-in funnel, one step of it, or a sequence. */
  kind: "funnel" | "step" | "sequence";
  /** Human label, e.g. "Trial: Day 3" or "Sequence: Cold IG Amazon". */
  label: string;
  /** Last updated (or reviewed) ISO timestamp; null = never stamped. */
  updatedAt: string | null;
  /** Actor of that change, e.g. "Elizabeth" or "code default". */
  updatedBy: string | null;
};

export type ReviewMetric = {
  /** 0..1, or null when it could not be measured (missing migration, empty cohort). */
  rate: number | null;
  /** 0..1 target. */
  target: number;
  /** Cohort size, when known. */
  den?: number | null;
  /** Activation only: false when the cohort predates the activation signal. */
  measurable?: boolean;
};

export type ReviewBelowTarget = {
  label: string;
  activation: ReviewMetric;
  paid: ReviewMetric;
};

export type ReviewExperiment = {
  name: string;
  /** "Trial: Day 3" style location, optional. */
  where?: string | null;
  status: "draft" | "running" | "decided" | "stopped";
  primaryMetric: string;
  startedAt: string | null;
  decidedAt: string | null;
  winnerArm: "a" | "b" | null;
  /** decision.outcome for decided tests: promote | inconclusive | conflict. */
  outcome?: string | null;
  /** Per-arm rates on the primary metric (0..1). */
  rates?: { a: number | null; b: number | null } | null;
  p?: number | null;
  sends: { a: number; b: number };
  minSendsPerArm: number;
  maxDays: number;
};

export type FunnelReviewReminderInput = {
  now: Date;
  /** Items older than this many days count as stale (default 30). */
  staleAfterDays?: number;
  /** Candidates; the builder keeps those older than staleAfterDays (or never stamped). */
  stale: ReviewStaleItem[];
  belowTarget: ReviewBelowTarget[];
  experiments: ReviewExperiment[];
  /** Present only while an announced price change is still ahead. */
  priceChange?: { effectiveAt: string } | null;
  adminUrl?: string;
};

function pct(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "n/a";
  return `${Math.round(rate * 100)}%`;
}

/** "Jul 2, 2026" in UTC so tests are deterministic. */
export function shortDate(iso: string | null | undefined): string {
  if (!iso) return "never";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "unknown date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(t));
}

function ageDays(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY_MS));
}

/** Stale rows, oldest first. Never-stamped rows sort before everything else. */
export function selectStale(
  items: ReviewStaleItem[],
  now: Date,
  staleAfterDays = 30,
): ReviewStaleItem[] {
  const keyed = items
    .map((item) => {
      const t = item.updatedAt ? Date.parse(item.updatedAt) : NaN;
      return { item, t: Number.isFinite(t) ? t : Number.NEGATIVE_INFINITY };
    })
    // Whole days, like funnel-staleness: 30 days old is still fresh, 31 is stale.
    .filter(
      ({ t }) =>
        t === Number.NEGATIVE_INFINITY || Math.floor((now.getTime() - t) / DAY_MS) > staleAfterDays,
    );
  keyed.sort((a, b) => a.t - b.t || a.item.label.localeCompare(b.item.label));
  return keyed.map((k) => k.item);
}

function isBelow(m: ReviewMetric): boolean {
  if (m.measurable === false) return false;
  return m.rate != null && Number.isFinite(m.rate) && m.rate < m.target;
}

/** Funnels where either measurable metric is under target. */
export function selectBelowTarget(rows: ReviewBelowTarget[]): ReviewBelowTarget[] {
  return rows.filter((r) => isBelow(r.activation) || isBelow(r.paid));
}

function metricLine(name: string, m: ReviewMetric): string {
  if (m.measurable === false) return `${name} not measurable yet (cohort predates the signal)`;
  const cohort = m.den != null ? `, cohort ${m.den}` : "";
  return `${name} ${pct(m.rate)} vs ${pct(m.target)} target${cohort}`;
}

function recentDecisions(experiments: ReviewExperiment[], now: Date): ReviewExperiment[] {
  return experiments
    .filter((e) => e.status === "decided" && e.decidedAt)
    .filter((e) => {
      const d = ageDays(e.decidedAt, now);
      return d != null && d <= 31;
    })
    .sort((a, b) => Date.parse(a.decidedAt as string) - Date.parse(b.decidedAt as string));
}

function running(experiments: ReviewExperiment[]): ReviewExperiment[] {
  return experiments
    .filter((e) => e.status === "running")
    .sort((a, b) => Date.parse(a.startedAt ?? "") - Date.parse(b.startedAt ?? "") || 0);
}

/**
 * A running test is stalled when it has used more than half its time but no
 * arm is at least halfway to the minimum sends, or when it has run past
 * max_days without being decided.
 */
export function isStalled(e: ReviewExperiment, now: Date): boolean {
  if (e.status !== "running") return false;
  const days = ageDays(e.startedAt, now);
  if (days == null) return false;
  if (days > e.maxDays) return true;
  const minArm = Math.min(e.sends.a, e.sends.b);
  return days > e.maxDays / 2 && minArm < e.minSendsPerArm / 2;
}

function decisionLine(e: ReviewExperiment): string {
  const where = e.where ? ` (${e.where})` : "";
  const rates = e.rates ? `, ${e.primaryMetric} A ${pct(e.rates.a)} vs B ${pct(e.rates.b)}` : "";
  const p = e.p != null && Number.isFinite(e.p) ? `, p=${e.p.toFixed(3)}` : "";
  const sends = `, sends ${e.sends.a}/${e.sends.b}`;
  let verdict: string;
  if (e.winnerArm) {
    verdict = `winner ${e.winnerArm.toUpperCase()}${e.winnerArm === "b" ? " (now the live copy)" : " (control kept)"}`;
  } else if (e.outcome === "conflict") {
    verdict = "conflict: the metrics disagree, needs your call";
  } else {
    verdict = "inconclusive: no clear winner, control kept";
  }
  return `- ${e.name}${where}: ${verdict}, decided ${shortDate(e.decidedAt)}${rates}${p}${sends}.`;
}

function runningLine(e: ReviewExperiment, now: Date): string {
  const where = e.where ? ` (${e.where})` : "";
  const days = ageDays(e.startedAt, now);
  const dayPart = days != null ? `day ${days} of ${e.maxDays}` : "not started";
  const stalled = isStalled(e, now) ? " STALLED: unlikely to reach the minimum, consider stopping it" : "";
  return `- ${e.name}${where}: ${dayPart}, sends A ${e.sends.a} / B ${e.sends.b} of ${e.minSendsPerArm} per arm.${stalled}`;
}

function needsLookCount(input: FunnelReviewReminderInput): number {
  const stale = selectStale(input.stale, input.now, input.staleAfterDays ?? 30).length;
  const below = selectBelowTarget(input.belowTarget).length;
  const decisions = recentDecisions(input.experiments, input.now).length;
  const stalled = input.experiments.filter((e) => isStalled(e, input.now)).length;
  return stale + below + decisions + stalled;
}

export function funnelReviewSubject(count: number): string {
  return `Monthly email funnel review: ${count} ${count === 1 ? "item needs" : "items need"} a look`;
}

/** Plain-text body. Pure. */
export function buildFunnelReviewReminderBody(input: FunnelReviewReminderInput): string {
  const { now } = input;
  const staleAfter = input.staleAfterDays ?? 30;
  const lines: string[] = [];
  const count = needsLookCount(input);

  lines.push(`Monthly email funnel review for ${shortDate(now.toISOString())}.`);
  lines.push(
    count === 0
      ? "All funnels fresh: nothing is stale, below target or waiting on an A/B call."
      : `${count} ${count === 1 ? "item needs" : "items need"} a look this month.`,
  );
  lines.push("");

  // 1. Stale
  const stale = selectStale(input.stale, now, staleAfter);
  lines.push(`STALE COPY (not updated or reviewed in over ${staleAfter} days, oldest first)`);
  if (stale.length === 0) {
    lines.push("- None. Every funnel, step and sequence was touched recently.");
  } else {
    for (const s of stale) {
      const days = ageDays(s.updatedAt, now);
      const when = s.updatedAt ? `updated ${shortDate(s.updatedAt)} (${days} days)` : "never updated";
      const by = s.updatedBy ? ` by ${s.updatedBy}` : "";
      lines.push(`- ${s.label}: ${when}${by}`);
    }
  }
  lines.push("");

  // 2. Below target
  const below = selectBelowTarget(input.belowTarget);
  lines.push("BELOW TARGET");
  if (below.length === 0) {
    lines.push("- None. Every measurable funnel is at or above its targets.");
  } else {
    for (const b of below) {
      lines.push(`- ${b.label}: ${metricLine("Activation", b.activation)}; ${metricLine("Paid", b.paid)}`);
    }
  }
  lines.push("");

  // 3. A/B
  const decisions = recentDecisions(input.experiments, now);
  const live = running(input.experiments);
  lines.push("A/B TESTS");
  if (decisions.length === 0 && live.length === 0) {
    lines.push("- No decisions in the last month and no tests running.");
  } else {
    if (decisions.length > 0) {
      lines.push("Decided in the last month:");
      for (const d of decisions) lines.push(decisionLine(d));
    } else {
      lines.push("Decided in the last month: none.");
    }
    if (live.length > 0) {
      lines.push("Running:");
      for (const r of live) lines.push(runningLine(r, now));
    } else {
      lines.push("Running: none.");
    }
  }
  lines.push("");

  // 4. Price change
  if (input.priceChange && Date.parse(input.priceChange.effectiveAt) > now.getTime()) {
    lines.push("PRICE CHANGE");
    lines.push(
      `- New prices take effect ${shortDate(input.priceChange.effectiveAt)}. Check any lock-in or "price goes up" copy in the funnels before then, and plan to remove it after that date.`,
    );
    lines.push("");
  }

  lines.push(`Review and edit everything here: ${input.adminUrl ?? ADMIN_EMAILS_URL}`);
  lines.push("");
  lines.push("Sent automatically on the 1st of each month by the funnel review reminder.");
  return lines.join("\n");
}

/** Subject + plain-text body. Pure. */
export function buildFunnelReviewReminder(input: FunnelReviewReminderInput): {
  subject: string;
  text: string;
  count: number;
} {
  const count = needsLookCount(input);
  return { subject: funnelReviewSubject(count), text: buildFunnelReviewReminderBody(input), count };
}

/**
 * Sends the reminder (plain text only) to each founder recipient, or to
 * `toOverride` when given. Returns how many sends succeeded.
 */
export async function sendFunnelReviewReminder(
  input: FunnelReviewReminderInput,
  toOverride?: string | null,
): Promise<number> {
  const { subject, text } = buildFunnelReviewReminder(input);
  const to = toOverride ? [toOverride] : founderRecipients();
  let sent = 0;
  for (const recipient of to) {
    try {
      const res = await sendEmail({
        from: transactionalFrom(),
        to: recipient,
        subject,
        text,
        category: FUNNEL_REVIEW_CATEGORY,
      });
      if (res.ok) sent++;
    } catch (err) {
      console.error("[funnel-review-reminder] send failed", err);
    }
  }
  return sent;
}

// ---------------------------------------------------------------------------
// Pure assembly helpers used by the cron route (kept here so they can be
// tested; Next route files may only export handlers).
// ---------------------------------------------------------------------------

export type StampLike = {
  updatedAt?: string | null;
  updatedBy?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

export type FunnelForReview = {
  key: string;
  name: string;
  steps: { tier: string; label: string; contentKeys: string[] }[];
};

function newest(
  stamps: Array<{ at: string | null | undefined; by: string | null | undefined }>,
): { at: string | null; by: string | null } {
  let best: { at: string | null; by: string | null } = { at: null, by: null };
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const s of stamps) {
    if (!s.at) continue;
    const t = Date.parse(s.at);
    if (!Number.isFinite(t) || t <= bestMs) continue;
    bestMs = t;
    best = { at: s.at, by: s.by ?? null };
  }
  return best;
}

/**
 * One stale-candidate row per built-in funnel step: the newest of every content
 * key's override save, its "Mark reviewed" stamp and its code-default date.
 * When every step of a funnel is stale, the steps collapse into one funnel row
 * (dated by the newest step) so the email stays short.
 */
export function collectFunnelStaleItems(args: {
  funnels: FunnelForReview[];
  /** Override stamps keyed `${funnel}:${contentKey}`. */
  overrides: Map<string, StampLike>;
  /** Code-default copy date for funnel + content key (YYYY-MM-DD or ISO), or null. */
  codeDateFor: (funnel: string, key: string) => string | null;
  now: Date;
  staleAfterDays?: number;
}): ReviewStaleItem[] {
  const staleAfter = args.staleAfterDays ?? 30;
  const out: ReviewStaleItem[] = [];
  for (const f of args.funnels) {
    const steps: ReviewStaleItem[] = f.steps.map((step) => {
      const keys = step.contentKeys.length > 0 ? step.contentKeys : [step.tier];
      const stamps: Array<{ at: string | null | undefined; by: string | null | undefined }> = [];
      for (const key of keys) {
        const ov = args.overrides.get(`${f.key}:${key}`);
        if (ov) {
          stamps.push({ at: ov.updatedAt, by: ov.updatedBy });
          stamps.push({ at: ov.reviewedAt, by: ov.reviewedBy ? `${ov.reviewedBy} (reviewed)` : "reviewed" });
        }
        const code = args.codeDateFor(f.key, key);
        if (code) stamps.push({ at: code, by: "code default" });
      }
      const s = newest(stamps);
      return { kind: "step", label: `${f.name}: ${step.label}`, updatedAt: s.at, updatedBy: s.by };
    });
    const stale = selectStale(steps, args.now, staleAfter);
    if (steps.length > 1 && stale.length === steps.length) {
      const s = newest(steps.map((x) => ({ at: x.updatedAt, by: x.updatedBy })));
      out.push({
        kind: "funnel",
        label: `${f.name} (all ${steps.length} steps)`,
        updatedAt: s.at,
        updatedBy: s.by,
      });
    } else {
      out.push(...stale);
    }
  }
  return out;
}

/** Below-target row for a funnel from its metrics and targets. */
export function belowTargetRow(
  label: string,
  metrics: {
    activation: { rate: number | null; den: number; measurable: boolean };
    paid: { rate: number | null; den: number };
  },
  targets: { activation: number; paid: number },
): ReviewBelowTarget {
  return {
    label,
    activation: {
      rate: metrics.activation.rate,
      den: metrics.activation.den,
      measurable: metrics.activation.measurable,
      target: targets.activation,
    },
    paid: { rate: metrics.paid.rate, den: metrics.paid.den, target: targets.paid },
  };
}
