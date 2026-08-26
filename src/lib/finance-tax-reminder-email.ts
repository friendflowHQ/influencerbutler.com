// Quarterly estimated-tax reminder email for the owner, sent by the
// finance-tax-reminder cron 7 days and 1 day before each IRS deadline.
// Mirrors the tax-review-reminder email conventions.

import { bodyToHtml } from "@/lib/newsletter";
import { sendEmail } from "@/lib/email-send";
import { formatUsdFromCents } from "@/lib/affiliates";
import type { TaxSetAside } from "@/lib/finance-tax";

// hello@ is the app's established transactional sender; no-reply@ has no
// sending reputation and gets spam-filtered.
const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";
const ADMIN_FINANCE_URL = "https://www.influencerbutler.com/dashboard/admin/finance";

/** Owner recipients: FINANCE_DIGEST_INBOX, else ADMIN_EMAILS. */
function recipients(): string[] {
  const raw = process.env.FINANCE_DIGEST_INBOX || process.env.ADMIN_EMAILS || "";
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type TaxReminderInput = {
  quarterLabel: string; // e.g. "Q3 2026 (Jun 1 - Aug 31)"
  dueDate: string; // YYYY-MM-DD
  daysOut: number;
  netProfitCents: number;
  setAside: TaxSetAside;
  taxMode: "passthrough" | "scorp";
  /** Utah use tax accrued this period on purchases (owed), estimate. */
  useTaxOwedCents?: number;
};

/** Plain-text reminder body. Pure, so it can be unit-tested. */
export function buildTaxReminderBody(input: TaxReminderInput): string {
  const lines: string[] = [];
  lines.push(
    `Quarterly estimated taxes for ${input.quarterLabel} are due ${input.dueDate} (${input.daysOut} day${input.daysOut === 1 ? "" : "s"} away).`,
  );
  lines.push("");
  lines.push(`Net profit for the period so far: ${formatUsdFromCents(input.netProfitCents)}`);
  lines.push("");
  lines.push("Recommended set-aside (planning estimate, not tax advice):");
  if (input.taxMode === "passthrough" && input.setAside.seTaxCents > 0) {
    lines.push(`  Self-employment tax: ${formatUsdFromCents(input.setAside.seTaxCents)}`);
  }
  lines.push(`  Federal income tax: ${formatUsdFromCents(input.setAside.federalCents)}`);
  lines.push(`  Utah income tax: ${formatUsdFromCents(input.setAside.utahCents)}`);
  lines.push(`  Total: ${formatUsdFromCents(input.setAside.totalCents)}`);
  lines.push("");
  lines.push("Pay federal at https://www.irs.gov/payments (Estimated tax) and Utah at https://tap.utah.gov.");
  lines.push("");
  if (input.useTaxOwedCents && input.useTaxOwedCents > 0) {
    lines.push(
      `Utah use tax accrued this period (on purchases, separate from income tax): ${formatUsdFromCents(input.useTaxOwedCents)}. File it on your Utah sales/use tax return.`,
    );
    lines.push("");
  }
  lines.push("Reminder: Lemon Squeezy remits sales tax as merchant of record on our sales; this covers income tax only.");
  lines.push("");
  lines.push("Full breakdown in the Finance dashboard (Taxes tab):");
  lines.push(ADMIN_FINANCE_URL);
  return lines.join("\n");
}

/** Send the reminder to the owner recipients. Returns true if any sent. */
export async function sendTaxReminder(input: TaxReminderInput): Promise<boolean> {
  const subject = `Estimated taxes due ${input.dueDate}: set aside ~${formatUsdFromCents(input.setAside.totalCents)}`;
  const text = buildTaxReminderBody(input);
  const html = bodyToHtml(text);
  let anyOk = false;
  for (const to of recipients()) {
    const { ok } = await sendEmail({
      from: FROM_ADDRESS,
      to,
      subject,
      text,
      html,
      category: "finance_tax_reminder",
    });
    anyOk = anyOk || ok;
  }
  return anyOk;
}
