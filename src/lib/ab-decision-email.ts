// Founder notification for the A/B engine: a decided test (winner promoted,
// inconclusive, or a guardrail conflict), a test that cannot reach its
// minimum sends in time, or a test auto-stopped by the price change.
//
// Plain text on purpose (Gmail filtered the HTML founder mails before), sent on
// the transactional stream to FOUNDER_SNAPSHOT_TO (comma list) or the default.

import { sendEmail } from "@/lib/email-send";
import { transactionalFrom } from "@/lib/email-senders";
import { founderRecipients } from "@/lib/founder-recipient";
import type { AbArmKey, AbMetric, DecideOutcome } from "@/lib/ab-stats";

export const AB_DECISION_CATEGORY = "ab_decision";
export const AB_ADMIN_URL = "https://www.influencerbutler.com/dashboard/admin/emails?tab=sequences";

export type AbEmailArm = {
  arm: AbArmKey;
  /** Short human label, e.g. "control" or a sequence name. */
  label?: string;
  sent: number;
  /** Primary metric successes / matured sends. */
  x: number;
  n: number;
  /** Guardrail rate (0..1) when measured. */
  guardrailRate?: number | null;
};

export type AbDecisionEmailInput = {
  kind: "decision" | "projection" | "auto-stop";
  name: string;
  /** Where the test runs, e.g. "App trial, day3 (everyone)" or "Sequence group cold-ig-amazon". */
  scope: string;
  primaryMetric: AbMetric;
  guardrailMetric?: AbMetric | null;
  outcome?: DecideOutcome;
  winner?: AbArmKey | null;
  arms?: AbEmailArm[];
  pValue?: number;
  z?: number;
  alpha?: number;
  look?: number;
  maxLooks?: number;
  /** What the engine changed (or refused to change), one line. */
  whatChanged?: string;
  reason?: string;
  /** projection only */
  projectedPerArm?: number;
  minSendsPerArm?: number;
  maxDays?: number;
};

const METRIC_LABEL: Record<AbMetric, string> = {
  click: "click rate",
  paid: "paid conversion",
  activation: "activation",
};

function pct(x: number, n: number): string {
  if (n <= 0) return "n/a";
  return `${((x / n) * 100).toFixed(1)}%`;
}

function fmtP(p: number | undefined): string {
  if (p === undefined || !Number.isFinite(p)) return "n/a";
  return p < 0.0001 ? "<0.0001" : p.toFixed(4);
}

/** Pure builder: subject + plain-text body. */
export function buildAbDecisionEmail(input: AbDecisionEmailInput): { subject: string; text: string } {
  const lines: string[] = [];
  let subject: string;

  if (input.kind === "projection") {
    subject = `A/B test may not finish: ${input.name}`;
    lines.push(`The A/B test "${input.name}" just started, but at the recent send rate it is projected to reach only about ${input.projectedPerArm ?? 0} sends per arm within ${input.maxDays ?? 0} days.`);
    lines.push(`It needs ${input.minSendsPerArm ?? 0} per arm before it can pick a winner, so it will most likely end inconclusive.`);
    lines.push("");
    lines.push(`Where: ${input.scope}`);
    lines.push(`Primary metric: ${METRIC_LABEL[input.primaryMetric]}`);
    lines.push("");
    lines.push("Options: widen the test (drop the segment), lower the minimum sends, or stop it and test a busier step.");
  } else if (input.kind === "auto-stop") {
    subject = `A/B test stopped: ${input.name}`;
    lines.push(`The A/B test "${input.name}" was stopped automatically.`);
    if (input.reason) lines.push(input.reason);
    lines.push("");
    lines.push(`Where: ${input.scope}`);
    lines.push("No winner was promoted. The control copy keeps sending.");
  } else {
    const outcome = input.outcome ?? "inconclusive";
    if (outcome === "promote") {
      subject = `A/B winner: arm ${(input.winner ?? "?").toUpperCase()} for ${input.name}`;
    } else if (outcome === "conflict") {
      subject = `A/B test needs your call: ${input.name}`;
    } else {
      subject = `A/B test inconclusive: ${input.name}`;
    }
    lines.push(`A/B test: ${input.name}`);
    lines.push(`Where: ${input.scope}`);
    lines.push(
      `Primary metric: ${METRIC_LABEL[input.primaryMetric]}` +
        (input.guardrailMetric ? `, guardrail: ${METRIC_LABEL[input.guardrailMetric]}` : ""),
    );
    if (input.look !== undefined) {
      lines.push(`Look ${input.look}${input.maxLooks ? ` of ${input.maxLooks}` : ""}, p=${fmtP(input.pValue)}${input.alpha ? ` (needs < ${input.alpha})` : ""}${input.z !== undefined ? `, z=${input.z.toFixed(2)}` : ""}`);
    }
    lines.push("");
    lines.push(
      outcome === "promote"
        ? `Result: arm ${(input.winner ?? "?").toUpperCase()} wins.`
        : outcome === "conflict"
          ? "Result: conflict. The primary metric picked a winner but the guardrail metric got significantly worse, so nothing was promoted."
          : "Result: no significant difference. The control copy stays.",
    );
    if (input.reason) lines.push(input.reason);
  }

  if (input.arms && input.arms.length > 0) {
    lines.push("");
    lines.push("Arms:");
    for (const a of input.arms) {
      const label = a.label ? ` (${a.label})` : "";
      const guard =
        input.guardrailMetric && a.guardrailRate !== undefined && a.guardrailRate !== null
          ? `, ${METRIC_LABEL[input.guardrailMetric]} ${(a.guardrailRate * 100).toFixed(1)}%`
          : "";
      lines.push(
        `- Arm ${a.arm.toUpperCase()}${label}: ${a.sent} sent, ${METRIC_LABEL[input.primaryMetric]} ${pct(a.x, a.n)} (${a.x}/${a.n})${guard}`,
      );
    }
  }

  if (input.whatChanged) {
    lines.push("");
    lines.push(`What changed: ${input.whatChanged}`);
  }
  lines.push("");
  lines.push(`Review or undo in the admin Emails page: ${AB_ADMIN_URL}`);
  lines.push("");
  lines.push("Influencer Butler A/B engine");

  return { subject, text: lines.join("\n") };
}

/** Builds and sends to every founder recipient. Never throws; true when at
 * least one send succeeded. */
export async function sendAbDecisionEmail(input: AbDecisionEmailInput): Promise<boolean> {
  try {
    const { subject, text } = buildAbDecisionEmail(input);
    let ok = false;
    for (const to of founderRecipients()) {
      const res = await sendEmail({
        from: transactionalFrom(),
        to,
        subject,
        text,
        category: AB_DECISION_CATEGORY,
        funnel: "transactional",
      });
      ok = ok || res.ok;
    }
    return ok;
  } catch (err) {
    console.error("ab-decision-email: send failed", err);
    return false;
  }
}
