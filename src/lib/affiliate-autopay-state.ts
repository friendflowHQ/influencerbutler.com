// Shared auto-pay state: whether auto-pay may move money, the review cap, and the
// month label. Single source of truth for the autopay cron, the dashboard toggle
// route, and the on-tax-verify auto-release hook.

export const AUTOPAY_ARMED_KEY = "affiliate_autopay_armed";

/** Review cap in cents: payouts over this wait for a manual Disburse. */
export function autopayCapCents(): number {
  const raw = Number(process.env.AFFILIATE_AUTOPAY_CAP_CENTS);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 20000; // $200 default
}

/** Current month as YYYY-MM (UTC). Used as a payout's period so a same-month
 *  re-disburse collides on its UNIQUE sender_batch_id instead of paying twice. */
export function autopayPeriod(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Whether auto-pay is armed (may actually move money): the env var
 * AFFILIATE_AUTOPAY_ENABLED="true" forces it on; otherwise the dashboard toggle,
 * stored in app_config under affiliate_autopay_armed, decides. Shadow (false) by
 * default. Accepts any admin client shape; best-effort (never throws).
 */
export async function isAutopayArmed(admin: unknown): Promise<boolean> {
  if (process.env.AFFILIATE_AUTOPAY_ENABLED === "true") return true;
  const db = admin as {
    from: (t: string) => {
      select: (c: string) => {
        eq: (k: string, v: string) => {
          maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
        };
      };
    };
  } | null;
  if (!db) return false;
  try {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", AUTOPAY_ARMED_KEY)
      .maybeSingle();
    const v = (data?.value ?? null) as { armed?: boolean } | null;
    return v?.armed === true;
  } catch {
    return false;
  }
}
