// Shared sender for marketing / funnel emails. Wraps sendEmail() so every
// funnel email gets identical compliance treatment in one place: skip
// suppressed addresses, append the unsubscribe footer, and set the RFC 8058
// List-Unsubscribe headers. All sends (and suppressed skips) are logged to
// email_sends via src/lib/email-send.ts for the admin Emails dashboard.
//
// Used by: trial-emails, pro-emails, conversion-emails, testimonial-email.
//
// Transactional mail (magic links, license keys, receipts, staff invites,
// commission statements) does NOT use this: it calls sendEmail() directly with
// no unsubscribe affordance, because those messages are required for a paid
// account to function.

import {
  isEmailSuppressed,
  unsubscribeFooterText,
  unsubscribeHeaders,
} from "@/lib/email-unsubscribe";
import { sendEmail, logSuppressedSkip, type EmailFunnel } from "@/lib/email-send";

export type MarketingEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
  /** Stable per-template key, e.g. 'trial_day0'. Shows up in the admin log. */
  category: string;
  funnel?: EmailFunnel;
};

/**
 * Sends one marketing email.
 *
 * Returns true when the send was HANDLED (Resend accepted it, OR the recipient
 * is suppressed so we deliberately skipped it). Callers stamp their "sent"
 * column on true, so a suppressed recipient is advanced past and never retried.
 *
 * Returns false only on a real failure (missing API key, Resend error, thrown
 * exception), which tells the caller to retry on the next run.
 */
export async function sendMarketingEmail(email: MarketingEmail): Promise<boolean> {
  if (await isEmailSuppressed(email.to)) {
    // Recipient opted out. Report "handled" so the caller stamps it as done and
    // stops reconsidering this row every run. Nothing is sent, but the skip is
    // logged so it stays visible in the admin dashboard.
    await logSuppressedSkip(email);
    return true;
  }

  const result = await sendEmail({
    from: email.from,
    to: email.to,
    subject: email.subject,
    text: email.text + unsubscribeFooterText(email.to),
    headers: unsubscribeHeaders(email.to),
    category: email.category,
    funnel: email.funnel,
  });
  return result.ok;
}
