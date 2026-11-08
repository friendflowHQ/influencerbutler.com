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
import { resendKeyFor, type EmailStream } from "@/lib/email-senders";

export type EmailFunnel =
  | "trial"
  // Desktop-app trial leads (walkthrough email capture). Separate from
  // "trial", which is the Lemon Squeezy checkout trial with a card on file.
  | "apptrial"
  | "pro"
  | "conversion"
  | "onboarding"
  | "winback"
  // Funnels v2 Beginner -> Power User nudges (cron affiliate-funnel Step H).
  | "upgrade"
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
  // content is base64. content_type/content_id are optional Resend fields;
  // content_id marks an inline image referenced from the HTML body via cid:.
  attachments?: { filename: string; content: string; content_type?: string; content_id?: string }[];
  /** Stable per-template key, e.g. 'trial_day0', 'login_link'. */
  category: string;
  funnel?: EmailFunnel;
  /** Which sending stream (domain + Resend key) this goes out on. Defaults to
   * "transactional" so a caller that forgets lands on the account-required
   * path, never on a marketing/cold domain. See src/lib/email-senders.ts. */
  stream?: EmailStream;
} & SendTracking;

/** Funnels v2 per-send tracking, logged to email_sends.step_key /
 * experiment_id / variant (20261110_funnels_v2_measure). All optional: when
 * none is set the logged row is exactly what it was before v2. */
export type SendTracking = {
  /** Content key actually sent, e.g. 'day5.mod-walmart.power'. */
  stepKey?: string | null;
  /** email_experiments.id when this send was part of an A/B test. */
  experimentId?: string | null;
  /** Experiment arm, 'a' | 'b'. */
  variant?: string | null;
};

export type EmailSendResult = { ok: boolean; id: string | null };

type LogRow = {
  resend_id: string | null;
  recipient: string;
  subject: string;
  category: string;
  funnel: EmailFunnel;
  status: "sent" | "suppressed" | "failed";
  // Funnels v2 tracking columns (20261110). Present only when set, so a row
  // without tracking is byte-identical to the pre-v2 insert.
  step_key?: string;
  experiment_id?: string;
  variant?: string;
};

const TRACKING_COLS = ["step_key", "experiment_id", "variant"] as const;

function hasTracking(row: LogRow): boolean {
  return TRACKING_COLS.some((c) => row[c] !== undefined);
}

function withoutTracking<T extends Record<string, unknown>>(row: T): T {
  const copy = { ...row };
  for (const c of TRACKING_COLS) delete copy[c];
  return copy;
}

/** "column does not exist" (Postgres 42703 / PostgREST PGRST204): the
 * tracking migration has not been applied to this database yet. */
function isMissingColumn(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42703" || error.code === "PGRST204");
}

async function logSend(row: LogRow): Promise<void> {
  try {
    const db = createAdminClient();
    let { error } = await db.from("email_sends").insert(row);
    if (error && isMissingColumn(error) && hasTracking(row)) {
      // Prod lags 20261110: log the send without the tracking columns rather
      // than lose the row.
      ({ error } = await db.from("email_sends").insert(withoutTracking(row)));
    }
    if (error && error.code === "23505" && row.resend_id) {
      // The Resend webhook's email.sent event won the race and inserted a
      // skeleton row (category 'unknown'). Upgrade it with the real metadata.
      const patch: Record<string, unknown> = {
        recipient: row.recipient,
        subject: row.subject,
        category: row.category,
        funnel: row.funnel,
        status: row.status,
      };
      for (const c of TRACKING_COLS) if (row[c] !== undefined) patch[c] = row[c];
      let { error: updateError } = await db
        .from("email_sends")
        .update(patch)
        .eq("resend_id", row.resend_id)
        .eq("category", "unknown");
      if (updateError && isMissingColumn(updateError) && hasTracking(row)) {
        ({ error: updateError } = await db
          .from("email_sends")
          .update(withoutTracking(patch))
          .eq("resend_id", row.resend_id)
          .eq("category", "unknown"));
      }
      if (updateError) console.error("email-send: log upgrade failed", updateError);
    } else if (error) {
      console.error("email-send: log insert failed", error);
    }
  } catch (err) {
    console.error("email-send: log insert threw", err);
  }
}

function logRowFor(
  input: Pick<EmailSendInput, "to" | "subject" | "category" | "funnel"> & SendTracking,
  status: LogRow["status"],
  resendId: string | null = null,
): LogRow {
  const row: LogRow = {
    resend_id: resendId,
    recipient: input.to.trim().toLowerCase(),
    subject: input.subject,
    category: input.category,
    funnel: input.funnel ?? "transactional",
    status,
  };
  if (input.stepKey) row.step_key = input.stepKey;
  if (input.experimentId) row.experiment_id = input.experimentId;
  if (input.variant) row.variant = input.variant;
  return row;
}

/**
 * Records a marketing send that was deliberately skipped because the recipient
 * is on the suppression list. Nothing is sent; the row makes the skip visible
 * in the admin dashboard instead of vanishing silently.
 */
export async function logSuppressedSkip(
  input: Pick<EmailSendInput, "to" | "subject" | "category" | "funnel"> & SendTracking,
): Promise<void> {
  await logSend(logRowFor(input, "suppressed"));
}

/**
 * Sends one email via Resend and logs it. Returns ok=false on a real failure
 * (missing API key, Resend rejection, thrown exception); the Resend message id
 * is returned on success so callers can correlate if they need to.
 */
export async function sendEmail(input: EmailSendInput): Promise<EmailSendResult> {
  // Default to the transactional stream so a caller that forgets lands on the
  // account-required key/domain, never on a marketing/cold one.
  const stream: EmailStream = input.stream ?? "transactional";
  const apiKey = resendKeyFor(stream);
  if (!apiKey) {
    console.error("Resend API key not set for stream - email not sent", {
      category: input.category,
      stream,
    });
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
