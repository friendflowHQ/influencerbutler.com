// Recall.ai recording-credit state + proactive owner alert.
//
// Call recordings run through Recall.ai, which is pay-per-use. When the account's
// credit balance hits zero, POST /bot/ returns HTTP 402 and NO recording bot can
// be created, so every call silently ends with recording_status 'failed' and the
// Retry button fails instantly (this is exactly how the Prime Day call was lost).
//
// This module is the single source of truth for "does Recall have credit right
// now": it persists the last-known status in app_config so the admin Events page
// can show a warning cheaply (no live probe on every load), and it emails the
// owner once when credit runs out so it is caught BEFORE a call, not four minutes
// before it starts.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-send";
import type { RecallCreditStatus } from "@/lib/recall";

/** app_config key holding the last-known Recall credit status (JSON below). */
export const RECALL_CREDIT_STATUS_KEY = "recall_credit_status";

/** Don't re-email the owner more than once per this window while credit is out. */
const ALERT_THROTTLE_MS = 12 * 3600_000;

const FROM_ADDRESS = "Influencer Butler <alerts@influencerbutler.com>";
const REPLY_TO = "support@influencerbutler.com";
const RECALL_BILLING_URL = "https://www.recall.ai/dashboard";
const ADMIN_EVENTS_URL = "https://www.influencerbutler.com/dashboard/admin/events";

export type StoredRecallCreditStatus = {
  /** Recall can currently create a recording bot. */
  ok: boolean;
  insufficientCredits: boolean;
  status: number | null;
  detail: string;
  /** When we last checked (ISO). */
  checkedAt: string;
  /** When we last emailed the owner about an outage (ISO), or null. */
  alertedAt: string | null;
};

type Admin = ReturnType<typeof createAdminClient>;

function adminClient(admin?: Admin | null): Admin | null {
  if (admin) return admin;
  try {
    return createAdminClient();
  } catch (e) {
    console.error("[recall-credit-alert] admin client", e);
    return null;
  }
}

/** Owner recipients: PAYOUT_DIGEST_INBOX, else ADMIN_EMAILS. Empty when neither set. */
function ownerRecipients(): string[] {
  const raw = process.env.PAYOUT_DIGEST_INBOX || process.env.ADMIN_EMAILS || "";
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Read the last-known Recall credit status (cheap; no live probe). Returns null
 * when nothing has been recorded yet or on any read error, so callers treat an
 * unknown state as "no warning to show".
 */
export async function getRecallCreditStatus(
  admin?: Admin | null,
): Promise<StoredRecallCreditStatus | null> {
  const db = adminClient(admin);
  if (!db) return null;
  try {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", RECALL_CREDIT_STATUS_KEY)
      .maybeSingle();
    return (data?.value as StoredRecallCreditStatus | undefined) ?? null;
  } catch {
    return null;
  }
}

async function writeStatus(db: Admin, value: StoredRecallCreditStatus): Promise<void> {
  try {
    await db.from("app_config").upsert(
      {
        key: RECALL_CREDIT_STATUS_KEY,
        value,
        updated_at: new Date().toISOString(),
        updated_by: "recall-credit-alert",
      },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("[recall-credit-alert] persist", e);
  }
}

/**
 * Record a fresh Recall credit check and, when credit has run out, email the
 * owner (throttled to once per ALERT_THROTTLE_MS so a repeated check does not
 * spam). Carries `alertedAt` forward while the outage persists and clears it once
 * credit is healthy again, so a later outage re-alerts. `upcoming` is a short
 * human note about what recording is at risk (used only in the email). Returns
 * whether an alert was sent. Best-effort throughout; never throws.
 */
export async function recordRecallCreditCheck(
  status: RecallCreditStatus,
  opts: { admin?: Admin | null; upcoming?: string } = {},
): Promise<{ alerted: boolean }> {
  const db = adminClient(opts.admin);
  if (!db) return { alerted: false };

  const prev = await getRecallCreditStatus(db);
  const now = new Date().toISOString();
  const ok = status.ok;

  // Only alert on a genuine credit exhaustion (not a config/auth error, which the
  // health endpoint already covers and which an email cannot fix by topping up).
  const outOfCredit = status.insufficientCredits;

  let alertedAt = prev?.alertedAt ?? null;
  let alerted = false;

  if (outOfCredit) {
    const lastMs = alertedAt ? Date.parse(alertedAt) : 0;
    const due = !Number.isFinite(lastMs) || Date.now() - lastMs >= ALERT_THROTTLE_MS;
    if (due) {
      alerted = await sendCreditAlertEmail({ detail: status.detail, upcoming: opts.upcoming });
      if (alerted) alertedAt = now;
    }
  } else if (ok) {
    // Credit is healthy again: reset the throttle so the next outage alerts.
    alertedAt = null;
  }

  await writeStatus(db, {
    ok,
    insufficientCredits: outOfCredit,
    status: status.status,
    detail: status.detail,
    checkedAt: now,
    alertedAt,
  });

  return { alerted };
}

async function sendCreditAlertEmail(args: { detail: string; upcoming?: string }): Promise<boolean> {
  const to = ownerRecipients();
  if (to.length === 0) {
    console.error("[recall-credit-alert] no owner recipients (set ADMIN_EMAILS)");
    return false;
  }
  const upcomingLine = args.upcoming
    ? `<p style="margin:0 0 12px"><strong>At risk:</strong> ${escapeHtml(args.upcoming)}</p>`
    : "";
  const subject = "Action needed: Recall recording credits are out";
  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;line-height:1.5">
      <h2 style="margin:0 0 12px;font-size:18px">Call recording is currently disabled</h2>
      <p style="margin:0 0 12px">Recall.ai has no recording credits left, so no bot can join upcoming calls. Any call that happens now will end with recording status <strong>failed</strong>, and the Retry recording button will keep failing until the balance is topped up.</p>
      ${upcomingLine}
      <p style="margin:0 0 12px"><strong>Fix:</strong> add credit (or turn on auto-recharge) on the Recall.ai dashboard, then click Retry recording on the affected call or event.</p>
      <p style="margin:0 0 20px">
        <a href="${RECALL_BILLING_URL}" style="display:inline-block;background:#7c3aed;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Open Recall.ai billing</a>
        &nbsp;
        <a href="${ADMIN_EVENTS_URL}" style="color:#7c3aed">Go to Events</a>
      </p>
      <p style="margin:0;color:#64748b;font-size:13px">Diagnostic: ${escapeHtml(args.detail)}</p>
    </div>`;
  const text =
    `Call recording is currently disabled.\n\n` +
    `Recall.ai has no recording credits left, so no bot can join upcoming calls. Any call that happens now will end as failed.\n\n` +
    (args.upcoming ? `At risk: ${args.upcoming}\n\n` : "") +
    `Fix: add credit (or enable auto-recharge) at ${RECALL_BILLING_URL}, then click Retry recording on the call/event.\n\n` +
    `Events: ${ADMIN_EVENTS_URL}\n` +
    `Diagnostic: ${args.detail}`;

  let anySent = false;
  for (const recipient of to) {
    const { ok } = await sendEmail({
      from: FROM_ADDRESS,
      to: recipient,
      replyTo: REPLY_TO,
      subject,
      html,
      text,
      category: "recall_credit_alert",
      funnel: "transactional",
    });
    anySent = anySent || ok;
  }
  return anySent;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
