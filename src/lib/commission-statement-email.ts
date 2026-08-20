// Monthly affiliate commission statement emails, via Resend.
//
// Two shapes, both plain-text with a simple HTML wrapper (matches the rest of
// the app, no template library):
//   * sendAffiliateStatement  -> one affiliate's own statement, to their email.
//   * sendCombinedStatement    -> a master copy listing every selected affiliate,
//                                 to AFFILIATE_STATEMENT_INBOX (the owner's
//                                 accounting inbox).
//
// Numbers come straight from the shared engine (AffiliateStatement): "earned"
// is the affiliate's full commission at their promised rate, "LS paid" is what
// Lemon Squeezy already credited (30%), and "owed" is the top-up we still pay.

import { bodyToHtml } from "@/lib/newsletter";
import { sendEmail } from "@/lib/email-send";
import { formatUsdFromCents } from "@/lib/affiliates";
import type { AffiliateStatement } from "@/lib/affiliate-commissions-data";

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";
const REPLY_TO = "affiliates@influencerbutler.com";
const DASHBOARD_URL = "https://www.influencerbutler.com/dashboard/affiliates";

export const DEFAULT_STATEMENT_INBOX = "thesocialmediaposse@gmail.com";

export function statementInbox(): string {
  return process.env.AFFILIATE_STATEMENT_INBOX?.trim() || DEFAULT_STATEMENT_INBOX;
}

/** "2026-06" -> "June 2026". Falls back to the raw string if malformed. */
export function formatPeriod(period: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return period;
  const year = Number(match[1]);
  const monthIdx = Number(match[2]) - 1;
  const names = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  if (monthIdx < 0 || monthIdx > 11) return period;
  return `${names[monthIdx]} ${year}`;
}

function shortDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
      new Date(iso),
    );
  } catch {
    return iso;
  }
}

function earnedCents(s: AffiliateStatement): number {
  // What they earned in total at their promised rate = LS's share + our top-up.
  return s.lsPaidCents + s.owedCents;
}

/** Per-affiliate statement body (plain text). */
export function buildStatementBody(statement: AffiliateStatement, period: string): string {
  const name = statement.fullName?.split(" ")[0] || "there";
  const lines: string[] = [];
  lines.push(`Hi ${name},`);
  lines.push("");
  lines.push(`Here is your Influencer Butler commission statement for ${formatPeriod(period)}.`);
  lines.push("");
  lines.push(`Your rate: ${statement.ratePercent}% (${statement.durationMonths === null ? "lifetime" : `${statement.durationMonths} months`}).`);
  lines.push("");

  if (statement.lines.length === 0) {
    lines.push("No commissionable orders this month.");
  } else {
    lines.push("Orders this month:");
    for (const l of statement.lines) {
      lines.push(
        `  ${shortDate(l.createdAt)}  order ${formatUsdFromCents(l.totalCents)}  ` +
          `commission owed ${formatUsdFromCents(l.owedCents)}`,
      );
    }
  }
  // Manual/make-whole adjustments (e.g. a customer given a deeper discount, where
  // we top you up to what you were referred at). The note explains each one.
  if (statement.adjustments.length > 0) {
    lines.push("");
    lines.push("Adjustments this month:");
    for (const a of statement.adjustments) {
      lines.push(`  ${formatUsdFromCents(a.amountCents)}  ${a.note ?? ""}`.trimEnd());
    }
  }
  lines.push("");
  lines.push(`Total earned this month: ${formatUsdFromCents(earnedCents(statement) + statement.adjustmentCents)}`);
  // During the transition off Lemon Squeezy, some renewals may still have been
  // credited by LS; only mention it when there's actually a nonzero amount.
  if (statement.lsPaidCents > 0) {
    lines.push(`Already credited by Lemon Squeezy: ${formatUsdFromCents(statement.lsPaidCents)}`);
  }
  lines.push(`Order commissions owed: ${formatUsdFromCents(statement.owedCents)}`);
  if (statement.adjustmentCents > 0) {
    lines.push(`Adjustments owed: ${formatUsdFromCents(statement.adjustmentCents)}`);
  }
  lines.push(`Balance we owe you (paid via PayPal): ${formatUsdFromCents(statement.owedCents + statement.adjustmentCents)}`);
  lines.push("");
  lines.push(
    "We pay via PayPal monthly. Earnings for a month clear after a short hold (about 30 days, to cover any refunds) and pay out on or around the 1st of the following month, once your balance reaches $10. PayPal receiving and currency-conversion fees are not covered, so the amount that lands may be slightly less. Make sure your tax form and PayPal email are set in your dashboard. Questions? Just reply to this email.",
  );
  lines.push("");
  lines.push("- The Influencer Butler team");
  return lines.join("\n");
}

/** Why an owed affiliate cannot be paid yet, keyed by userId. */
export type NotReadyMap = Map<string, { missingTax: boolean; missingPaypal: boolean }>;

function notReadyReason(reason: { missingTax: boolean; missingPaypal: boolean }): string {
  const missing = [
    reason.missingTax ? "tax form" : null,
    reason.missingPaypal ? "PayPal email" : null,
  ].filter(Boolean);
  return missing.length > 0 ? missing.join(" + ") : "setup";
}

/** Combined master body listing every selected affiliate. */
export function buildCombinedBody(
  statements: AffiliateStatement[],
  period: string,
  notReady?: NotReadyMap,
): string {
  const lines: string[] = [];
  lines.push(`Affiliate commission statement: ${formatPeriod(period)}`);
  lines.push("");
  let totalOwed = 0;
  let totalEarned = 0;
  let totalLs = 0;
  let totalBlocked = 0;
  let totalAdjust = 0;
  for (const s of statements) {
    const who = s.fullName || s.email || s.affiliateCode || s.userId;
    lines.push(`${who}${s.affiliateCode ? ` (${s.affiliateCode})` : ""} - rate ${s.ratePercent}%`);
    lines.push(
      `  ${s.orderCount} order(s), earned ${formatUsdFromCents(earnedCents(s) + s.adjustmentCents)}, ` +
        `owed via PayPal ${formatUsdFromCents(s.owedCents + s.adjustmentCents)}`,
    );
    if (s.adjustmentCents > 0) {
      lines.push(
        `  includes ${formatUsdFromCents(s.adjustmentCents)} in adjustments/make-whole ` +
          `(pay via the "Mark make-whole paid" action, not the Owed disburse)`,
      );
    }
    const blocked = notReady?.get(s.userId);
    if (blocked) {
      lines.push(`  NOT PAYABLE YET: missing ${notReadyReason(blocked)} (reminder sent)`);
      totalBlocked += s.owedCents;
    }
    lines.push("");
    totalOwed += s.owedCents;
    totalEarned += earnedCents(s);
    totalLs += s.lsPaidCents;
    totalAdjust += s.adjustmentCents;
  }
  lines.push("----------------------------------------");
  lines.push(`Total earned: ${formatUsdFromCents(totalEarned + totalAdjust)}`);
  if (totalLs > 0) {
    lines.push(`Total already credited by Lemon Squeezy: ${formatUsdFromCents(totalLs)}`);
  }
  lines.push(`Total order commissions owed: ${formatUsdFromCents(totalOwed)}`);
  if (totalAdjust > 0) {
    lines.push(`Total adjustments / make-whole owed: ${formatUsdFromCents(totalAdjust)}`);
  }
  if (totalBlocked > 0) {
    lines.push(`Total not yet payable (missing tax form / PayPal): ${formatUsdFromCents(totalBlocked)}`);
  }
  lines.push("");
  lines.push('Disburse order commissions via PayPal in the Owed tab (or mark paid if you paid another way). Adjustments / make-whole are recorded separately via their "Mark make-whole paid" action.');
  return lines.join("\n");
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  text: string;
  category: string;
}): Promise<boolean> {
  const { ok } = await sendEmail({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: bodyToHtml(params.text),
    replyTo: REPLY_TO,
    category: params.category,
  });
  return ok;
}

/** Send one affiliate their own statement. No-op (returns false) with no email. */
export async function sendAffiliateStatement(
  statement: AffiliateStatement,
  period: string,
): Promise<boolean> {
  if (!statement.email) {
    console.error("sendAffiliateStatement: affiliate has no email", statement.userId);
    return false;
  }
  return sendViaResend({
    to: statement.email,
    subject: `Your commission statement: ${formatPeriod(period)}`,
    text: buildStatementBody(statement, period),
    category: "commission_statement",
  });
}

/** Send the combined master copy to the accounting inbox. */
export async function sendCombinedStatement(
  statements: AffiliateStatement[],
  period: string,
  notReady?: NotReadyMap,
): Promise<boolean> {
  return sendViaResend({
    to: statementInbox(),
    subject: `Affiliate commissions: ${formatPeriod(period)}`,
    text: buildCombinedBody(statements, period, notReady),
    category: "commission_statement",
  });
}

// -------------------------------------------------------------------------
// Tax-form / payout reminder
//
// Sent to an affiliate who has earned commission but cannot be paid yet
// because their tax form is not verified and/or they have no PayPal email on
// file. This is a TRANSACTIONAL email (it is required for a paid account to
// receive money it is owed), so it goes through the same direct-to-Resend
// path as the statement above: no suppression check, no unsubscribe footer.
// -------------------------------------------------------------------------

export type TaxReminderParams = {
  to: string;
  name: string | null;
  owedCents: number;
  missingTax: boolean;
  missingPaypal: boolean;
};

/** Reminder body (plain text). */
export function buildTaxReminderBody(params: TaxReminderParams): string {
  const first = params.name?.split(" ")[0] || "there";
  const lines: string[] = [];
  lines.push(`Hi ${first},`);
  lines.push("");
  lines.push(
    `Good news: you have ${formatUsdFromCents(params.owedCents)} in Influencer Butler affiliate commissions waiting.`,
  );
  lines.push("");
  lines.push("Before we can send it, we need a couple of things from you:");
  if (params.missingTax) {
    lines.push("  - Your tax form (a W-9 if you're in the US, or a W-8BEN / W-8BEN-E if you're outside the US)");
  }
  if (params.missingPaypal) {
    lines.push("  - Your PayPal payout email");
  }
  lines.push("");
  lines.push(`Add them here: ${DASHBOARD_URL}`);
  lines.push("");
  lines.push(
    "Once that's done you'll be paid on our next monthly run. We pay via PayPal monthly, on or around the 1st of the month, once your balance reaches $10. PayPal receiving and currency-conversion fees are not covered, so the amount that lands may be slightly less.",
  );
  lines.push("");
  lines.push("Questions? Just reply to this email.");
  lines.push("");
  lines.push("- The Influencer Butler team");
  return lines.join("\n");
}

/** Send an affiliate a "complete your tax form / PayPal to get paid" reminder. */
export async function sendTaxFormReminder(params: TaxReminderParams): Promise<boolean> {
  if (!params.to) {
    console.error("sendTaxFormReminder: no recipient email");
    return false;
  }
  const amount = formatUsdFromCents(params.owedCents);
  const subject = params.missingTax
    ? `Action needed: add your tax form to get your ${amount} commission`
    : `Action needed: add your PayPal email to get your ${amount} commission`;
  return sendViaResend({
    to: params.to,
    subject,
    text: buildTaxReminderBody(params),
    category: "tax_form_reminder",
  });
}
