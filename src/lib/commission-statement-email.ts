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
import { formatUsdFromCents } from "@/lib/affiliates";
import type { AffiliateStatement } from "@/lib/affiliate-commissions-data";

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";
const REPLY_TO = "affiliates@influencerbutler.com";

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
  lines.push("");
  lines.push(`Total earned this month: ${formatUsdFromCents(earnedCents(statement))}`);
  // During the transition off Lemon Squeezy, some renewals may still have been
  // credited by LS; only mention it when there's actually a nonzero amount.
  if (statement.lsPaidCents > 0) {
    lines.push(`Already credited by Lemon Squeezy: ${formatUsdFromCents(statement.lsPaidCents)}`);
  }
  lines.push(`Balance we owe you (paid via PayPal): ${formatUsdFromCents(statement.owedCents)}`);
  lines.push("");
  lines.push(
    "We pay via PayPal on or around the 1st of each month, once your balance reaches $10. PayPal receiving and currency-conversion fees are not covered, so the amount that lands may be slightly less. Make sure your tax form and PayPal email are set in your dashboard. Questions? Just reply to this email.",
  );
  lines.push("");
  lines.push("- The Influencer Butler team");
  return lines.join("\n");
}

/** Combined master body listing every selected affiliate. */
export function buildCombinedBody(statements: AffiliateStatement[], period: string): string {
  const lines: string[] = [];
  lines.push(`Affiliate commission statement: ${formatPeriod(period)}`);
  lines.push("");
  let totalOwed = 0;
  let totalEarned = 0;
  let totalLs = 0;
  for (const s of statements) {
    const who = s.fullName || s.email || s.affiliateCode || s.userId;
    lines.push(`${who}${s.affiliateCode ? ` (${s.affiliateCode})` : ""} - rate ${s.ratePercent}%`);
    lines.push(
      `  ${s.orderCount} order(s), earned ${formatUsdFromCents(earnedCents(s))}, ` +
        `owed via PayPal ${formatUsdFromCents(s.owedCents)}`,
    );
    lines.push("");
    totalOwed += s.owedCents;
    totalEarned += earnedCents(s);
    totalLs += s.lsPaidCents;
  }
  lines.push("----------------------------------------");
  lines.push(`Total earned: ${formatUsdFromCents(totalEarned)}`);
  if (totalLs > 0) {
    lines.push(`Total already credited by Lemon Squeezy: ${formatUsdFromCents(totalLs)}`);
  }
  lines.push(`Total owed this month: ${formatUsdFromCents(totalOwed)}`);
  lines.push("");
  lines.push('Disburse each affiliate via PayPal in the Owed tab (or mark paid if you paid another way).');
  return lines.join("\n");
}

async function sendViaResend(params: {
  to: string;
  subject: string;
  text: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set - commission statement skipped");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        reply_to: REPLY_TO,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: bodyToHtml(params.text),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Commission statement send failed", { status: res.status, body: body.slice(0, 500) });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Commission statement send threw", error);
    return false;
  }
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
  });
}

/** Send the combined master copy to the accounting inbox. */
export async function sendCombinedStatement(
  statements: AffiliateStatement[],
  period: string,
): Promise<boolean> {
  return sendViaResend({
    to: statementInbox(),
    subject: `Affiliate commissions: ${formatPeriod(period)}`,
    text: buildCombinedBody(statements, period),
  });
}
