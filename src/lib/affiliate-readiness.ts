// Affiliate payout readiness + the auto-pay partition.
//
// "Ready to be paid" = a verified tax form AND a PayPal email on file. Shared by
// the monthly commission-statements cron (statement vs reminder) and the
// affiliate-autopay cron (who to auto-disburse). The partition itself is a pure
// function so the eligibility / cap logic is unit-tested without a database.

import { createAdminClient } from "@/lib/admin";
import type { AffiliateStatement } from "@/lib/affiliate-commissions-data";

/** Whether an affiliate can be paid, plus the PayPal address to pay. */
export type Readiness = { taxVerified: boolean; hasPaypal: boolean; paypalEmail: string | null };

/** Look up tax-form + PayPal readiness for the given affiliate userIds. */
export async function loadReadiness(userIds: string[]): Promise<Map<string, Readiness>> {
  const out = new Map<string, Readiness>();
  if (userIds.length === 0) return out;
  const db = createAdminClient() as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        in: (col: string, values: string[]) => Promise<{ data: Record<string, unknown>[] | null }>;
      };
    };
  } | null;
  if (!db) return out;
  for (const id of userIds) out.set(id, { taxVerified: false, hasPaypal: false, paypalEmail: null });
  try {
    const { data: tax } = await db
      .from("affiliate_tax_forms")
      .select("user_id,status")
      .in("user_id", userIds);
    for (const row of tax ?? []) {
      const uid = typeof row.user_id === "string" ? row.user_id : null;
      if (uid && out.has(uid)) out.get(uid)!.taxVerified = row.status === "verified";
    }
    const { data: profs } = await db
      .from("profiles")
      .select("id,paypal_email")
      .in("id", userIds);
    for (const row of profs ?? []) {
      const uid = typeof row.id === "string" ? row.id : null;
      const email = typeof row.paypal_email === "string" ? row.paypal_email.trim() : "";
      if (uid && out.has(uid)) {
        const r = out.get(uid)!;
        r.hasPaypal = email.length > 0;
        r.paypalEmail = email.length > 0 ? email : null;
      }
    }
  } catch (error) {
    console.error("loadReadiness failed", error);
  }
  return out;
}

export type NotReadyEntry = {
  statement: AffiliateStatement;
  missingTax: boolean;
  missingPaypal: boolean;
};

export type AutopayPartition = {
  /** Ready, payable at/under the cap: safe to auto-disburse. */
  toPay: AffiliateStatement[];
  /** Ready, but payable over the cap: leave for a manual admin Disburse. */
  heldOverCap: AffiliateStatement[];
  /** Would be paid now but missing a verified tax form and/or PayPal email. */
  notReady: NotReadyEntry[];
};

/**
 * Split owed affiliates into auto-pay / held-over-cap / not-ready. Considers only
 * affiliates whose CURRENTLY PAYABLE amount (cleared + recognized) is at least
 * `minCents`; anyone below that is simply not due yet (still clearing) and is
 * omitted from every bucket. Pure: no IO.
 */
export function partitionAutopay(
  statements: AffiliateStatement[],
  readiness: Map<string, Readiness>,
  opts: { minCents: number; capCents: number },
): AutopayPartition {
  const toPay: AffiliateStatement[] = [];
  const heldOverCap: AffiliateStatement[] = [];
  const notReady: NotReadyEntry[] = [];

  for (const s of statements) {
    if (s.payableCents < opts.minCents) continue; // not due yet
    const r = readiness.get(s.userId);
    const missingTax = !r?.taxVerified;
    const missingPaypal = !r?.hasPaypal;
    if (missingTax || missingPaypal) {
      notReady.push({ statement: s, missingTax, missingPaypal });
      continue;
    }
    if (s.payableCents > opts.capCents) {
      heldOverCap.push(s);
      continue;
    }
    toPay.push(s);
  }

  return { toPay, heldOverCap, notReady };
}
