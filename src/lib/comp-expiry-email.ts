// Comp-expiry digest email, via Resend. One plain-text digest per cron run that
// has something to report: comps just auto-cancelled, comps expiring soon, and
// comps still missing a duration. Goes to the owner (COMP_ALERT_INBOX, else the
// ADMIN_EMAILS allowlist, else the shared statement inbox) - never the customer.

import { bodyToHtml } from "@/lib/newsletter";
import { DEFAULT_STATEMENT_INBOX } from "@/lib/commission-statement-email";
import type { CompRow } from "@/lib/comps-data";

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";

/** Owner recipients: COMP_ALERT_INBOX, else every ADMIN_EMAILS entry, else default. */
export function compAlertRecipients(): string[] {
  const explicit = process.env.COMP_ALERT_INBOX?.trim();
  if (explicit) return [explicit];
  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(/[\s,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (admins.length > 0) return admins;
  return [DEFAULT_STATEMENT_INBOX];
}

function line(row: CompRow): string {
  const who = row.email ?? row.name ?? row.lsSubscriptionId;
  const days =
    row.daysRemaining == null
      ? ""
      : row.daysRemaining <= 0
        ? ` (${Math.abs(row.daysRemaining)}d overdue)`
        : ` (${row.daysRemaining}d left)`;
  const code = row.discountCode ? ` [${row.discountCode}]` : "";
  return `  ${who}${code}${days}`;
}

export function buildDigestBody(params: {
  cancelled: CompRow[];
  warn: CompRow[];
  needsMonths: CompRow[];
}): string {
  const lines: string[] = [];
  lines.push("Comp expiry check");
  lines.push("");
  if (params.cancelled.length > 0) {
    lines.push(`Auto-cancelled (${params.cancelled.length}) - free window ended, card protected:`);
    params.cancelled.forEach((r) => lines.push(line(r)));
    lines.push("");
  }
  if (params.warn.length > 0) {
    lines.push(`Expiring soon (${params.warn.length}) - will auto-cancel at expiry:`);
    params.warn.forEach((r) => lines.push(line(r)));
    lines.push("");
  }
  if (params.needsMonths.length > 0) {
    lines.push(
      `Needs a duration (${params.needsMonths.length}) - set months on the Comps page so these can be tracked:`,
    );
    params.needsMonths.forEach((r) => lines.push(line(r)));
    lines.push("");
  }
  lines.push("Manage these at /dashboard/admin/comps.");
  return lines.join("\n");
}

/** Sends the digest. Returns false (no-op) when RESEND_API_KEY is unset. */
export async function sendCompDigest(params: {
  cancelled: CompRow[];
  warn: CompRow[];
  needsMonths: CompRow[];
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set - comp digest skipped");
    return false;
  }
  const text = buildDigestBody(params);
  const subject = `Comps: ${params.cancelled.length} cancelled, ${params.warn.length} expiring`;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: compAlertRecipients(),
        subject,
        text,
        html: bodyToHtml(text),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Comp digest send failed", { status: res.status, body: body.slice(0, 500) });
      return false;
    }
    return true;
  } catch (error) {
    console.error("Comp digest send threw", error);
    return false;
  }
}
