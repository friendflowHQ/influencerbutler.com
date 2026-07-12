// Shared throttle for the affiliate "add your tax form to get paid" reminder.
//
// The reminder fires from two places: the monthly commission-statements cron
// (batch, at settlement time) and the admin disburse route (reactively, when a
// payout attempt is blocked for a missing/unverified tax form or PayPal email).
// This helper dedupes them to at most one reminder per affiliate per calendar
// month via an app_config marker (key tax_reminder_<userId>_<YYYY-MM>), so the
// two triggers never double-email the same affiliate.

import { sendTaxFormReminder, type TaxReminderParams } from "@/lib/commission-statement-email";

type ThrottleClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

/** app_config key that dedupes tax reminders to one per affiliate per month. */
export function taxReminderKey(userId: string, month: string): string {
  return `tax_reminder_${userId}_${month}`;
}

/** Current calendar month as YYYY-MM (UTC). */
export function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function alreadyReminded(db: ThrottleClient, userId: string, month: string): Promise<boolean> {
  try {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", taxReminderKey(userId, month))
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function markReminded(db: ThrottleClient, userId: string, month: string): Promise<void> {
  try {
    await db.from("app_config").upsert(
      {
        key: taxReminderKey(userId, month),
        value: { sent_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
        updated_by: "tax-reminder",
      },
      { onConflict: "key" },
    );
  } catch (error) {
    console.error("markReminded failed", error);
  }
}

/**
 * Send a tax-form reminder to one affiliate at most once per calendar month.
 * Best-effort: swallows its own errors and returns true only when an email was
 * actually sent (false if throttled, misconfigured, or the send failed). Never
 * throws, so callers on the money-movement path stay unaffected.
 */
export async function sendTaxReminderOnce(
  db: unknown,
  userId: string,
  params: TaxReminderParams,
): Promise<boolean> {
  const client = db as ThrottleClient | null;
  if (!client || !userId) return false;
  try {
    const month = currentMonth();
    if (await alreadyReminded(client, userId, month)) return false;
    const ok = await sendTaxFormReminder(params);
    if (ok) await markReminded(client, userId, month);
    return ok;
  } catch (error) {
    console.error("sendTaxReminderOnce failed", error);
    return false;
  }
}
