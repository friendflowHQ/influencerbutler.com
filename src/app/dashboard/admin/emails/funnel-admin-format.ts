// Pure formatting helpers for the Funnels v2 admin UI (goal bars, updated
// badges, step editor tabs, A/B experiment panel). No React, no fetches, so
// they are unit-tested in src/lib/__tests__/funnel-admin-format.test.ts.
//
// Every field read from the API is optional here: the admin UI must keep
// rendering against the pre-v2 API shape (missing metrics, missing dates,
// missing experiments) while migrations are still being hand-applied.

import { parseContentKey, type AnyModuleKey } from "@/lib/funnel-types";

export type Staleness = "fresh" | "amber" | "red";

export const DAY_MS = 86_400_000;
/** Fresh at or under 30 days, amber 31-60, red over 60 (mirrors the API). */
export const AMBER_AFTER_DAYS = 30;
export const RED_AFTER_DAYS = 60;
/** Weekly looks per experiment (Pocock design, alpha 0.0182 per look). */
export const MAX_LOOKS = 4;

export type MetricBlock = {
  num?: number;
  den?: number;
  rate?: number | null;
  target?: number;
  measurable?: boolean;
};

export type ExperimentArm = {
  arm: "a" | "b";
  subject?: string | null;
  body?: string | null;
  sends?: number;
  clicks?: number;
  conversions?: number;
  clickRate?: number | null;
  conversionRate?: number | null;
};

export type ExperimentMetric = "click" | "paid" | "activation";
export type ExperimentStatus = "draft" | "running" | "decided" | "stopped";

export type ExperimentSummary = {
  id: string;
  funnel?: string | null;
  tier?: string | null;
  contentKey?: string | null;
  segment?: string | null;
  name?: string;
  status?: ExperimentStatus | string;
  primaryMetric?: ExperimentMetric | string;
  guardrailMetric?: ExperimentMetric | string | null;
  minSendsPerArm?: number;
  maxDays?: number;
  looksDone?: number;
  lastLookAt?: string | null;
  startedAt?: string | null;
  decidedAt?: string | null;
  winnerArm?: "a" | "b" | null;
  decision?: Record<string, unknown> | null;
  arms?: ExperimentArm[];
};

/** Parses an ISO timestamp or a YYYY-MM-DD code date. null when unusable. */
export function parseIsoMs(iso: string | null | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Whole days since `iso` (never negative). null when there is no date. */
export function daysSince(iso: string | null | undefined, now: number = Date.now()): number | null {
  const t = parseIsoMs(iso);
  if (t == null) return null;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** Staleness bucket for a last-updated date. No date counts as red (never reviewed). */
export function stalenessOf(iso: string | null | undefined, now: number = Date.now()): Staleness {
  const d = daysSince(iso, now);
  if (d == null) return "red";
  if (d <= AMBER_AFTER_DAYS) return "fresh";
  if (d <= RED_AFTER_DAYS) return "amber";
  return "red";
}

/** True for a value the API may send as `stale`. */
export function isStaleness(v: unknown): v is Staleness {
  return v === "fresh" || v === "amber" || v === "red";
}

/** "Nov 8, 2026". Formatted in UTC so a YYYY-MM-DD code date never slips a day. */
export function formatShortDate(iso: string | null | undefined): string | null {
  const t = parseIsoMs(iso);
  if (t == null) return null;
  return new Date(t).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Badge text. "Updated Nov 8, 2026 by X", plus " - Needs review" when amber or
 * red so the state is never carried by color alone.
 */
export function updatedBadgeText(
  iso: string | null | undefined,
  by: string | null | undefined,
  stale: Staleness,
  opts: { showBy?: boolean } = {},
): string {
  const date = formatShortDate(iso);
  const who = opts.showBy === false ? "" : (by ?? "").trim();
  const head = date ? `Updated ${date}${who ? ` by ${who}` : ""}` : "No update date";
  return stale === "fresh" ? head : `${head} - Needs review`;
}

/** 0.34 -> "34%". */
export function pctLabel(rate: number | null | undefined): string {
  if (rate == null || !Number.isFinite(rate)) return "-";
  return `${Math.round(rate * 100)}%`;
}

/** Default goal when the API does not send a target. */
export const DEFAULT_TARGET = 0.8;

export type GoalBarView =
  | { kind: "unmeasurable"; text: string }
  | { kind: "nodata"; text: string }
  | { kind: "value"; text: string; valuePct: number; targetPct: number; meetsTarget: boolean };

/** "Activation 34% of 80% goal (17/50)" and the bar numbers. */
export function goalBarView(label: string, block: MetricBlock | null | undefined): GoalBarView {
  if (!block) return { kind: "nodata", text: `${label}: no data yet` };
  if (block.measurable === false) return { kind: "unmeasurable", text: `${label}: not measurable yet` };
  const target =
    typeof block.target === "number" && block.target > 0 && block.target <= 1
      ? block.target
      : DEFAULT_TARGET;
  const num = typeof block.num === "number" ? block.num : 0;
  const den = typeof block.den === "number" ? block.den : 0;
  const rate =
    typeof block.rate === "number" && Number.isFinite(block.rate)
      ? block.rate
      : den > 0
        ? num / den
        : null;
  if (rate == null || den <= 0) {
    return { kind: "nodata", text: `${label}: no data yet (goal ${pctLabel(target)})` };
  }
  const valuePct = Math.max(0, Math.min(100, Math.round(rate * 100)));
  const targetPct = Math.round(target * 100);
  return {
    kind: "value",
    text: `${label} ${valuePct}% of ${targetPct}% goal (${num.toLocaleString("en-US")}/${den.toLocaleString("en-US")})`,
    valuePct,
    targetPct,
    meetsTarget: rate >= target,
  };
}

/**
 * Parses what an admin typed as a goal. Whole percents ("80", "80%") or a
 * fraction ("0.8"). Returns the 0.01..1 fraction the set-target PATCH wants,
 * or null when out of range.
 */
export function parseTargetInput(raw: string): number | null {
  const s = raw.trim().replace(/%$/, "").trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  const frac = n > 1 ? n / 100 : n;
  if (frac < 0.01 || frac > 1) return null;
  return Math.round(frac * 10000) / 10000;
}

const BASE_LABEL: Record<string, string> = {
  beginner: "Beginner",
  power: "Power",
  unknown: "Unknown",
  starter: "Starter",
};

const MODULE_LABEL: Record<AnyModuleKey, string> = {
  "cc-auto": "CC auto-accept",
  walmart: "Walmart",
  deals: "Deals",
  social: "Social",
  video: "Video",
  "amazon-offsite": "Amazon offsite",
  "amazon-onsite": "Amazon onsite",
  photo: "Photo",
  benable: "Benable",
  youtube: "YouTube",
  "starter-offsite": "Starter offsite",
  "starter-onsite": "Starter onsite",
};

/** Tab label for a content key: "Base", "Beginner", "Walmart module", "Walmart module (Power)". */
export function contentKeyLabel(key: string): string {
  const p = parseContentKey(key);
  if (!p) return key;
  const base = p.base ? BASE_LABEL[p.base] ?? p.base : null;
  if (p.module) {
    const mod = `${MODULE_LABEL[p.module] ?? p.module} module`;
    return base ? `${mod} (${base})` : mod;
  }
  return base ?? "Base";
}

/** The experiment `segment` for a content key: null for the bare tier, else the key suffix. */
export function segmentForKey(key: string): string | null {
  const dot = key.indexOf(".");
  return dot < 0 ? null : key.slice(dot + 1) || null;
}

/** Default primary metric: click for early steps (day 0 to 5), paid for later ones. */
export function defaultPrimaryMetric(dayOffset: number | null | undefined): ExperimentMetric {
  return typeof dayOffset === "number" && dayOffset > 5 ? "paid" : "click";
}

export function metricLabel(m: string | null | undefined): string {
  if (m === "click") return "Click rate";
  if (m === "paid") return "Paid conversion";
  if (m === "activation") return "Activation";
  return m ? String(m) : "-";
}

/** The rate an arm shows for a metric (click rate for click, conversion rate otherwise). */
export function armRate(arm: ExperimentArm, metric: string | null | undefined): number | null {
  if (metric === "click") {
    if (typeof arm.clickRate === "number") return arm.clickRate;
    return arm.sends && arm.sends > 0 && typeof arm.clicks === "number" ? arm.clicks / arm.sends : null;
  }
  if (typeof arm.conversionRate === "number") return arm.conversionRate;
  return arm.sends && arm.sends > 0 && typeof arm.conversions === "number"
    ? arm.conversions / arm.sends
    : null;
}

/** "p = 0.031 (97% confidence)" from decision.p, or null when there is no look yet. */
export function confidenceLabel(decision: Record<string, unknown> | null | undefined): string | null {
  const p = decision && typeof decision.p === "number" ? decision.p : null;
  if (p == null || !Number.isFinite(p)) return null;
  const pText = p < 0.001 ? "< 0.001" : `= ${p.toFixed(3)}`;
  const conf = Math.max(0, Math.min(99.9, (1 - p) * 100));
  const confText = conf >= 99 ? conf.toFixed(1) : String(Math.round(conf));
  return `p ${pText} (${confText}% confidence)`;
}

/** "Look 2 of 4". */
export function lookLabel(looksDone: number | null | undefined): string {
  const n = typeof looksDone === "number" && looksDone > 0 ? Math.min(looksDone, MAX_LOOKS) : 0;
  return `Look ${n} of ${MAX_LOOKS}`;
}

/** Human status, including why a decided test has no winner. */
export function experimentStatusLabel(exp: ExperimentSummary): string {
  const status = String(exp.status ?? "draft");
  if (status === "decided") {
    if (exp.winnerArm) return `Decided: arm ${exp.winnerArm.toUpperCase()} won`;
    const outcome = exp.decision && typeof exp.decision.outcome === "string" ? exp.decision.outcome : "";
    if (outcome === "conflict") return "Decided: no winner (guardrail conflict)";
    return "Decided: no winner (inconclusive)";
  }
  if (status === "running") return "Running";
  if (status === "stopped") return "Stopped";
  return "Draft";
}

const EM_DASH = String.fromCharCode(0x2014);

/**
 * Client-side checks for a new arm B (the API re-checks). Returns an error
 * message or null.
 */
export function validateArmB(subject: string, body: string): string | null {
  if (subject.trim() === "" || body.trim() === "") return "Arm B needs both a subject and a body.";
  const text = `${subject}\n${body}`;
  if (text.includes(EM_DASH)) return "Remove the em dash: use a colon, a hyphen or a comma instead.";
  if (text.includes("{{priceLockLine}}") || /\bNov(ember)?\.? 29\b/i.test(text)) {
    return "Arm B cannot mention the price-lock date: it changes before the test ends.";
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(text)) {
    return "Arm B cannot contain a literal date: it would be wrong for later recipients.";
  }
  return null;
}
