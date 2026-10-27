// Scheduled-downgrade digest email, via Resend. One plain-text digest per cron
// run that has something to report: downgrades just applied at renewal, and
// any that were skipped because the subscription changed status in the
// meantime. Goes to the owner - never the customer (same recipient rule as
// the comp-expiry digest).

import { bodyToHtml } from "@/lib/newsletter";
import { sendEmail } from "@/lib/email-send";
import { compAlertRecipients } from "@/lib/comp-expiry-email";

export type DowngradeRow = {
  email: string | null;
  lsSubscriptionId: string;
  targetPlan: string;
};

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";

function line(row: DowngradeRow): string {
  return `  ${row.email ?? row.lsSubscriptionId} -> ${row.targetPlan} (${row.lsSubscriptionId})`;
}

export function buildDowngradeDigestBody(params: {
  applied: DowngradeRow[];
  skipped: DowngradeRow[];
}): string {
  const lines: string[] = ["Scheduled downgrades", ""];
  if (params.applied.length > 0) {
    lines.push(`Applied at renewal (${params.applied.length}):`);
    params.applied.forEach((r) => lines.push(line(r)));
    lines.push("");
  }
  if (params.skipped.length > 0) {
    lines.push(`Skipped - subscription status changed before renewal (${params.skipped.length}):`);
    params.skipped.forEach((r) => lines.push(line(r)));
    lines.push("");
  }
  lines.push("Manage these in Lemon Squeezy / the subscriptions table directly.");
  return lines.join("\n");
}

/** Sends the digest. Returns false (no-op) when RESEND_API_KEY is unset. */
export async function sendDowngradeDigest(params: {
  applied: DowngradeRow[];
  skipped: DowngradeRow[];
}): Promise<boolean> {
  const text = buildDowngradeDigestBody(params);
  const subject = `Scheduled downgrades: ${params.applied.length} applied, ${params.skipped.length} skipped`;
  const html = bodyToHtml(text);
  const results = await Promise.all(
    compAlertRecipients().map((to) =>
      sendEmail({ from: FROM_ADDRESS, to, subject, text, html, category: "scheduled_downgrade" }),
    ),
  );
  return results.every((r) => r.ok);
}
