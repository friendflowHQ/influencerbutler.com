// Shared sender for marketing / funnel emails. Wraps the raw Resend call so
// every funnel email gets identical compliance treatment in one place: skip
// suppressed addresses, append the unsubscribe footer, and set the RFC 8058
// List-Unsubscribe headers.
//
// Used by: trial-emails, pro-emails, conversion-emails, testimonial-email.
//
// Transactional mail (magic links, license keys, receipts, staff invites,
// commission statements) does NOT use this: it posts to api.resend.com/emails
// directly with no unsubscribe affordance, because those messages are required
// for a paid account to function.

import {
  isEmailSuppressed,
  unsubscribeFooterText,
  unsubscribeHeaders,
} from "@/lib/email-unsubscribe";

export type MarketingEmail = {
  from: string;
  to: string;
  subject: string;
  text: string;
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
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set - marketing email skipped");
    return false;
  }

  if (await isEmailSuppressed(email.to)) {
    // Recipient opted out. Report "handled" so the caller stamps it as done and
    // stops reconsidering this row every run. Nothing is sent.
    return true;
  }

  const text = email.text + unsubscribeFooterText(email.to);

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        subject: email.subject,
        text,
        headers: unsubscribeHeaders(email.to),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Marketing email send failed", { status: res.status, body: body.slice(0, 500) });
      return false;
    }
    return true;
  } catch (err) {
    console.error("Marketing email send threw", err);
    return false;
  }
}
