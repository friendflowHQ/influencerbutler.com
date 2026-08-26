// Admin tax-review emails, via Resend.
//
// Two templates share this file:
//  - the month-end reminder (last day of the month, ~5pm Mountain) listing the
//    tax forms still pending review before the 1st-of-month auto-pay run, plus
//    held-over-cap and not-set-up FYIs; sent by the tax-review-reminder cron.
//  - the instant "tax form submitted" alert, sent by the affiliate tax-form
//    route the moment a W-9 / W-8BEN lands, so a form never sits unnoticed.

import { bodyToHtml } from "@/lib/newsletter";
import { sendEmail } from "@/lib/email-send";
import { formatUsdFromCents } from "@/lib/affiliates";
import { statementInbox, formatPeriod } from "@/lib/commission-statement-email";

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";
const REPLY_TO = "affiliates@influencerbutler.com";
const ADMIN_AFFILIATES_URL = "https://www.influencerbutler.com/dashboard/admin/affiliates";

/** Owner recipients: PAYOUT_DIGEST_INBOX, else ADMIN_EMAILS, else the statement inbox. */
function recipients(): string[] {
  const raw = process.env.PAYOUT_DIGEST_INBOX || process.env.ADMIN_EMAILS || "";
  const list = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [statementInbox()];
}

function shortDate(iso: string | null): string {
  if (!iso) return "unknown date";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

/**
 * True when the given local wall-clock date is the last day of its month.
 * `month` is 1-based (as returned by localParts). Pure.
 */
export function isLastDayOfLocalMonth(parts: { year: number; month: number; day: number }): boolean {
  // Day 0 of the following month is the last day of this one.
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();
  return parts.day === lastDay;
}

export type TaxReviewPendingRow = {
  name: string;
  email: string | null;
  formType: string | null;
  submittedAt: string | null;
  payableCents: number | null;
};

export type TaxReviewContextRow = {
  name: string;
  payableCents: number;
  detail: string;
};

export type TaxReviewReminderInput = {
  /** The payout period that runs tomorrow (YYYY-MM), i.e. next month. */
  period: string;
  armed: boolean;
  pending: TaxReviewPendingRow[];
  heldOverCap: TaxReviewContextRow[];
  notReady: TaxReviewContextRow[];
};

/** Plain-text reminder body. Pure, so it can be unit-tested. */
export function buildTaxReviewReminderBody(input: TaxReviewReminderInput): string {
  const lines: string[] = [];
  lines.push(`Affiliate payout pre-check for ${formatPeriod(input.period)}.`);
  lines.push(
    input.armed
      ? "Auto-pay is ARMED and runs tomorrow morning. Anything you verify before then is paid automatically."
      : "Auto-pay is in SHADOW mode: tomorrow's run only previews. Verified affiliates still need a manual Disburse in the Owed tab.",
  );
  lines.push("");

  if (input.pending.length > 0) {
    lines.push(`Tax forms pending your review (${input.pending.length}):`);
    lines.push("These affiliates cannot be paid until you verify their form.");
    for (const p of input.pending) {
      const email = p.email ? ` (${p.email})` : "";
      const form = p.formType ?? "tax form";
      const payable =
        p.payableCents !== null ? `, payable ${formatUsdFromCents(p.payableCents)}` : "";
      lines.push(`  ${p.name}${email}: ${form}, submitted ${shortDate(p.submittedAt)}${payable}`);
    }
    lines.push("");
  } else {
    lines.push("No tax forms are waiting on review. Nice.");
    lines.push("");
  }

  if (input.heldOverCap.length > 0) {
    lines.push("Held for manual review (over the auto-pay cap):");
    for (const r of input.heldOverCap) {
      lines.push(`  ${r.name}: ${formatUsdFromCents(r.payableCents)}  (${r.detail})`);
    }
    lines.push("");
  }

  if (input.notReady.length > 0) {
    lines.push("Payable but not set up on their side (FYI, they were nudged):");
    for (const r of input.notReady) {
      lines.push(`  ${r.name}: ${formatUsdFromCents(r.payableCents)}  (${r.detail})`);
    }
    lines.push("");
  }

  lines.push("Review and verify from the Tasks card at the top of the affiliates dashboard:");
  lines.push(ADMIN_AFFILIATES_URL);
  return lines.join("\n");
}

/** Send the month-end review reminder to the owner recipients. Returns true if any sent. */
export async function sendTaxReviewReminder(input: TaxReviewReminderInput): Promise<boolean> {
  const subject =
    input.pending.length > 0
      ? `Tax forms to review before the 1st: ${input.pending.length} pending`
      : `Affiliate payout pre-check: ${formatPeriod(input.period)}`;
  const text = buildTaxReviewReminderBody(input);
  const html = bodyToHtml(text);
  let anyOk = false;
  for (const to of recipients()) {
    const { ok } = await sendEmail({
      from: FROM_ADDRESS,
      to,
      subject,
      text,
      html,
      replyTo: REPLY_TO,
      category: "tax_review_reminder",
    });
    anyOk = anyOk || ok;
  }
  return anyOk;
}

export type TaxFormSubmittedInput = {
  userId: string;
  name: string;
  email: string | null;
  formType: string;
  country: string | null;
  tinLast4: string | null;
  tinKind: string | null;
  submittedAt: string;
  isResubmit: boolean;
};

/** Plain-text submitted-alert body. Pure, so it can be unit-tested. */
export function buildTaxFormSubmittedBody(input: TaxFormSubmittedInput): string {
  const lines: string[] = [];
  lines.push(
    input.isResubmit
      ? `${input.name} re-submitted their ${input.formType} tax form (replaces the earlier one).`
      : `${input.name} submitted a ${input.formType} tax form.`,
  );
  lines.push("");
  if (input.email) lines.push(`Email: ${input.email}`);
  if (input.country) lines.push(`Country: ${input.country}`);
  if (input.tinLast4) {
    const kind = input.tinKind ? ` (${input.tinKind.toUpperCase()})` : "";
    lines.push(`TIN: **** ${input.tinLast4}${kind}`);
  }
  lines.push(`Submitted: ${shortDate(input.submittedAt)}`);
  lines.push("");
  lines.push("They cannot be paid until you verify it. Review this affiliate directly:");
  lines.push(`${ADMIN_AFFILIATES_URL}/${input.userId}`);
  lines.push("");
  lines.push("Or verify from the Tasks card at the top of the affiliates dashboard:");
  lines.push(ADMIN_AFFILIATES_URL);
  return lines.join("\n");
}

/** Alert the owner that a tax form just landed. Returns true if any sent. */
/**
 * Subject for the submitted alert. Deliberately excludes the affiliate's legal
 * name: subjects persist to email_sends.subject, which is readable with the
 * assistant-grantable reports.view permission. The name stays in the body only.
 */
export function submittedAlertSubject(formType: string): string {
  return `Tax form submitted (${formType})`;
}

export async function sendTaxFormSubmittedAlert(input: TaxFormSubmittedInput): Promise<boolean> {
  const subject = submittedAlertSubject(input.formType);
  const text = buildTaxFormSubmittedBody(input);
  const html = bodyToHtml(text);
  let anyOk = false;
  for (const to of recipients()) {
    const { ok } = await sendEmail({
      from: FROM_ADDRESS,
      to,
      subject,
      text,
      html,
      replyTo: REPLY_TO,
      category: "tax_form_submitted",
    });
    anyOk = anyOk || ok;
  }
  return anyOk;
}
