// Admin "affiliate payouts due" digest, via Resend.
//
// Emailed to the owner by the affiliate-autopay cron. In SHADOW mode it previews
// what auto-pay WOULD send; once armed it reports what it actually paid, held
// (over the review cap), or could not pay (missing tax form / PayPal). Held and
// not-ready affiliates are the owner's manual follow-ups in the Owed tab.

import { bodyToHtml } from "@/lib/newsletter";
import { sendEmail } from "@/lib/email-send";
import { formatUsdFromCents } from "@/lib/affiliates";
import { statementInbox, formatPeriod } from "@/lib/commission-statement-email";

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";
const REPLY_TO = "affiliates@influencerbutler.com";
const OWED_TAB_URL = "https://www.influencerbutler.com/dashboard/admin/affiliates";

export type PayoutDigestStatus = "paid" | "failed" | "would-pay" | "held" | "not-ready";

export type PayoutDigestRow = {
  name: string;
  payableCents: number;
  paypalEmail: string | null;
  status: PayoutDigestStatus;
  detail?: string | null;
};

/** Owner recipients: PAYOUT_DIGEST_INBOX, else ADMIN_EMAILS, else the statement inbox. */
function recipients(): string[] {
  const raw = process.env.PAYOUT_DIGEST_INBOX || process.env.ADMIN_EMAILS || "";
  const list = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : [statementInbox()];
}

const SECTION: { status: PayoutDigestStatus; heading: string }[] = [
  { status: "paid", heading: "Paid" },
  { status: "would-pay", heading: "Would pay (shadow mode - not sent)" },
  { status: "held", heading: "Held for manual review (over the cap)" },
  { status: "not-ready", heading: "Not payable yet (missing tax form / PayPal)" },
  { status: "failed", heading: "Failed - needs a look" },
];

/** Plain-text digest body. Pure, so it can be unit-tested. */
export function buildPayoutDigestBody(
  rows: PayoutDigestRow[],
  opts: { armed: boolean; period: string; capCents: number },
): string {
  const lines: string[] = [];
  lines.push(`Affiliate payouts: ${formatPeriod(opts.period)}`);
  lines.push(
    opts.armed
      ? "Auto-pay is ARMED. Here is what ran this month."
      : "Auto-pay is in SHADOW mode (nothing was sent). This is a preview of what it WOULD pay once you arm it.",
  );
  lines.push(`Review cap: ${formatUsdFromCents(opts.capCents)} (anything over this waits for a manual Disburse).`);
  lines.push("");

  let totalActionable = 0;
  for (const section of SECTION) {
    const group = rows.filter((r) => r.status === section.status);
    if (group.length === 0) continue;
    lines.push(`${section.heading}:`);
    let subtotal = 0;
    for (const r of group) {
      subtotal += r.payableCents;
      const paypal = r.paypalEmail ? ` -> ${r.paypalEmail}` : "";
      const detail = r.detail ? `  (${r.detail})` : "";
      lines.push(`  ${r.name}: ${formatUsdFromCents(r.payableCents)}${paypal}${detail}`);
    }
    lines.push(`  Subtotal: ${formatUsdFromCents(subtotal)}`);
    lines.push("");
    if (section.status !== "not-ready") totalActionable += subtotal;
  }

  if (rows.length === 0) {
    lines.push("No affiliates are due a payout right now.");
    lines.push("");
  }

  lines.push("----------------------------------------");
  lines.push(`Total across payable affiliates: ${formatUsdFromCents(totalActionable)}`);
  lines.push("");
  lines.push(`Disburse held amounts (or any not-ready affiliate once they're set up) in the Owed tab: ${OWED_TAB_URL}`);
  return lines.join("\n");
}

/** Send the payouts-due digest to the owner recipients. Returns true if any sent. */
export async function sendPayoutsDueDigest(
  rows: PayoutDigestRow[],
  opts: { armed: boolean; period: string; capCents: number },
): Promise<boolean> {
  const subject = opts.armed
    ? `Affiliate payouts run: ${formatPeriod(opts.period)}`
    : `Affiliate payouts due (preview): ${formatPeriod(opts.period)}`;
  const text = buildPayoutDigestBody(rows, opts);
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
      category: "payouts_due_digest",
    });
    anyOk = anyOk || ok;
  }
  return anyOk;
}
