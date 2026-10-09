// Transactional emails for self-serve account deletion. Plain text on purpose:
// these are short, account-critical messages. Sent on the transactional stream
// so they work even for people who unsubscribed from marketing.

import { sendEmail } from "@/lib/email-send";
import { transactionalFrom } from "@/lib/email-senders";

const SUPPORT = "privacy@influencerbutler.com";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

async function send(to: string, subject: string, text: string, category: string): Promise<boolean> {
  const res = await sendEmail({
    from: transactionalFrom(),
    to,
    subject,
    text,
    category,
    funnel: "transactional",
    stream: "transactional",
    replyTo: SUPPORT,
  });
  return res.ok;
}

export async function sendDeletionScheduledEmail(to: string, scheduledForIso: string): Promise<boolean> {
  const when = formatDate(scheduledForIso);
  return send(
    to,
    "Your Influencer Butler account is scheduled for deletion",
    [
      "We received a request to delete your Influencer Butler account.",
      "",
      `Your account and its data will be permanently deleted on ${when} (UTC).`,
      "",
      "Changed your mind? Sign in at https://www.influencerbutler.com/dashboard/profile and choose",
      '"Cancel deletion" any time before then. Nothing is deleted until that date.',
      "",
      `If you did not ask for this, cancel it right away and email ${SUPPORT}.`,
    ].join("\n"),
    "account_deletion_scheduled",
  );
}

export async function sendDeletionCompletedEmail(to: string): Promise<boolean> {
  return send(
    to,
    "Your Influencer Butler account has been deleted",
    [
      "Your Influencer Butler account and its data have been deleted, as you asked.",
      "",
      "A few records are kept where the law requires it (for example payment and tax records),",
      "as described in our Privacy Policy: https://www.influencerbutler.com/legal/privacy",
      "",
      `Questions? Email ${SUPPORT}.`,
    ].join("\n"),
    "account_deletion_completed",
  );
}

export async function sendDeletionCanceledEmail(to: string, reason: "subscription" | "staff"): Promise<boolean> {
  const why =
    reason === "subscription"
      ? "your account has an active paid subscription again. Cancel the subscription on the Subscription page first."
      : "this account cannot be deleted from the dashboard.";
  return send(
    to,
    "Your account deletion was not carried out",
    [
      "We did not delete your Influencer Butler account because " + why,
      "",
      "To delete it, request deletion again from https://www.influencerbutler.com/dashboard/profile",
      `once that is resolved, or email ${SUPPORT}.`,
    ].join("\n"),
    "account_deletion_canceled",
  );
}
