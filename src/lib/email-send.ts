// Shared Resend send helper: the ONE place the app POSTs to
// api.resend.com/emails. Every send (marketing and transactional) goes through
// sendEmail(), which captures the Resend message id and logs a row into
// email_sends so the admin Emails dashboard can show what was sent, to whom,
// and (via the Resend webhook filling in event timestamps) who opened it.
//
// Logging is strictly best-effort: a Supabase hiccup or a missing email_sends
// table must never block or fail a send. The Resend webhook
// (/api/webhooks/resend) later stamps delivered/opened/clicked/bounced on the
// row, matched by resend_id.
//
// Marketing mail should NOT call this directly: use sendMarketingEmail()
// (src/lib/marketing-email.ts), which layers suppression checks and the
// unsubscribe affordance on top before delegating here.

import { createAdminClient } from "@/lib/supabase/admin";

export type EmailFunnel =
  | "trial"
  | "pro"
  | "conversion"
  | "onboarding"
  | "winback"
  | "newsletter"
  | "campaign"
  | "sequence"
  | "transactional";

export type EmailSendInput = {
  from: string;
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
  headers?: Record<string, string>;
  attachments?: { filename: string; content: string }[];
  /** Stable per-template key, e.g. 'trial_day0', 'login_link'. */
  category: string;
  funnel?: EmailFunnel;
};

export type EmailSendResult = { ok: boolean; id: string | null };

type LogRow = {
  resend_id: string | null;
  recipient: string;
  subject: string;
  category: string;
  funnel: EmailFunnel;
  status: "sent" | "suppressed" | "failed";
};

async function logSend(row: LogRow): Promise<void> {
  try {
    const db = createAdminClient();
    const { error } = await db.from("email_sends").insert(row);
    if (error && error.code === "23505" && row.resend_id) {
      // The Resend webhook's email.sent event won the race and inserted a
      // skeleton row (category 'unknown'). Upgrade it with the real metadata.
      const { error: updateError } = await db
        .from("email_sends")
        .update({
          recipient: row.recipient,
          subject: row.subject,
          category: row.category,
          funnel: row.funnel,
          status: row.status,
        })
        .eq("resend_id", row.resend_id)
        .eq("category", "unknown");
      if (updateError) console.error("email-send: log upgrade failed", updateError);
    } else if (error) {
      console.error("email-send: log insert failed", error);
    }
  } catch (err) {
    console.error("email-send: log insert threw", err);
  }
}

function logRowFor(
  input: Pick<EmailSendInput, "to" | "subject" | "category" | "funnel">,
  status: LogRow["status"],
  resendId: string | null = null,
): LogRow {
  return {
    resend_id: resendId,
    recipient: input.to.trim().toLowerCase(),
    subject: input.subject,
    category: input.category,
    funnel: input.funnel ?? "transactional",
    status,
  };
}

/**
 * Records a marketing send that was deliberately skipped because the recipient
 * is on the suppression list. Nothing is sent; the row makes the skip visible
 * in the admin dashboard instead of vanishing silently.
 */
export async function logSuppressedSkip(
  input: Pick<EmailSendInput, "to" | "subject" | "category" | "funnel">,
): Promise<void> {
  await logSend(logRowFor(input, "suppressed"));
}

/**
 * Sends one email via Resend and logs it. Returns ok=false on a real failure
 * (missing API key, Resend rejection, thrown exception); the Resend message id
 * is returned on success so callers can correlate if they need to.
 */
export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set - email not sent", { category: input.category });
    await logSend(logRowFor(input, "failed"));
    return { ok: false, id: null };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        ...(input.text ? { text: input.text } : {}),
        ...(input.html ? { html: input.html } : {}),
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
        ...(input.headers ? { headers: input.headers } : {}),
        ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("Email send failed", {
        category: input.category,
        status: res.status,
        body: body.slice(0, 500),
      });
      await logSend(logRowFor(input, "failed"));
      return { ok: false, id: null };
    }

    let id: string | null = null;
    try {
      const parsed = (await res.json()) as { id?: string };
      id = typeof parsed.id === "string" ? parsed.id : null;
    } catch {
      // Resend accepted the send; a malformed body just means no id to log.
    }
    await logSend(logRowFor(input, "sent", id));
    return { ok: true, id };
  } catch (err) {
    console.error("Email send threw", { category: input.category }, err);
    await logSend(logRowFor(input, "failed"));
    return { ok: false, id: null };
  }
}
