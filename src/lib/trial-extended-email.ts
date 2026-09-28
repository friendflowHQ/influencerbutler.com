// Transactional notice sent to a customer when an admin extends their free
// trial. Sent via sendEmail() (the pure transactional path): it always sends,
// never consults the suppression list, and carries no unsubscribe footer, the
// same way license-key and sign-in emails go out. A trial extension is a
// billing/account event, not marketing.

import { sendEmail } from "@/lib/email-send";
import { transactionalFrom } from "@/lib/email-senders";
import { bodyToHtml } from "@/lib/newsletter";

/** Formats an ISO timestamp as a friendly UTC date, e.g. "December 25, 2026".
 * UTC so it matches the trial_ends_at value stored in Lemon Squeezy. */
export function formatTrialDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

export function trialExtendedEmailBody(input: {
  planName: string;
  newTrialEndsAt: string;
  monthsAdded: number;
}): { subject: string; text: string } {
  const when = formatTrialDate(input.newTrialEndsAt);
  const months = input.monthsAdded === 1 ? "1 month" : `${input.monthsAdded} months`;
  const subject = "Your Influencer Butler trial has been extended";
  const text = [
    `Hi there,`,
    ``,
    `Good news: we have extended your Influencer Butler free trial.`,
    ``,
    `  Plan: ${input.planName}`,
    `  New trial end date: ${when}`,
    `  Extra time added: ${months}`,
    ``,
    `You will not be charged until your new trial end date, and there is`,
    `nothing you need to do. Your account and all Pro features stay active`,
    `in the meantime.`,
    ``,
    `Questions, or want to make a change? Just reply to this email and we`,
    `will help.`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");
  return { subject, text };
}

/** Sends the trial-extended notice. Returns true when Resend accepted it. */
export async function sendTrialExtendedEmail(input: {
  to: string;
  planName: string;
  newTrialEndsAt: string;
  monthsAdded: number;
}): Promise<boolean> {
  const { subject, text } = trialExtendedEmailBody(input);
  const { ok } = await sendEmail({
    from: transactionalFrom(),
    to: input.to,
    subject,
    text,
    html: bodyToHtml(text),
    category: "trial_extended",
  });
  return ok;
}
