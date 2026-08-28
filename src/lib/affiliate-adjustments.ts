// Affiliate make-whole / manual adjustment helpers.
//
// When we honor a deeper discount for a referred customer, the affiliate's
// commission (30% of the net actually charged) shrinks. To keep them whole we
// record an `affiliate_commission_adjustments` row for the difference. This
// module holds the pure make-whole math (unit-tested) plus the loader that reads
// open (unpaid) adjustments so the owed/statement/dashboard surfaces can show
// them.
//
// Adjustments are deliberately NOT folded into the order-derived owed total that
// the automated PayPal disburse pays (paypal-payouts.ts stamps orders on
// success and knows nothing about adjustments, so folding them in would
// double-pay). They are surfaced as a separate line and settled by a dedicated
// "mark paid" action that writes an ad-hoc affiliate_payouts row.

export const MAKE_WHOLE_MAX_WINDOW_MONTHS = 12;

export type MakeWholeInput = {
  /** The affiliate's promised commission rate (e.g. 30). */
  ratePercent: number;
  /** Net price the affiliate referred the customer at, in cents. */
  referredPriceCents: number;
  /** The new (deeper-discounted) net price, in cents. */
  newPriceCents: number;
  /** Billing cadence of the plan. */
  interval: "month" | "year";
  /** Honored commission window in months (capped by the caller, default 12). */
  windowMonths: number;
};

export type MakeWholeResult = {
  /** Commission difference per billing period, in cents (floored at 0). */
  perBillingCents: number;
  /** Number of billings the make-whole covers within the window. */
  billings: number;
  /** Total make-whole owed, in cents. */
  amountCents: number;
};

/**
 * The commission difference we owe the affiliate when a referred customer's net
 * price drops from `referredPriceCents` to `newPriceCents`:
 *
 *   perBilling = ratePercent% x max(0, referred - new)
 *   billings   = annual -> ceil(window/12) ; monthly -> window
 *   amount     = perBilling x billings
 *
 * A deeper discount (new < referred) yields a positive amount; a "discount" that
 * would raise the price yields 0 (never claws back from the affiliate).
 */
export function computeMakeWhole(input: MakeWholeInput): MakeWholeResult {
  const rate = Number.isFinite(input.ratePercent) ? Math.max(0, Math.min(100, input.ratePercent)) : 0;
  const diffCents = Math.max(0, Math.round(input.referredPriceCents) - Math.round(input.newPriceCents));
  const perBillingCents = Math.round((diffCents * rate) / 100);
  const window = Number.isFinite(input.windowMonths) ? Math.max(1, Math.round(input.windowMonths)) : 1;
  const billings =
    input.interval === "year" ? Math.max(1, Math.ceil(window / 12)) : Math.max(1, window);
  return { perBillingCents, billings, amountCents: perBillingCents * billings };
}

/**
 * Clamp an affiliate's honored duration to the make-whole window. Null (lifetime)
 * and anything over the cap collapse to MAKE_WHOLE_MAX_WINDOW_MONTHS, so a
 * lifetime affiliate is still only auto-compensated for the first year (an admin
 * can add a manual adjustment for more).
 */
export function makeWholeWindowMonths(durationMonths: number | null): number {
  if (durationMonths === null || !Number.isFinite(durationMonths) || durationMonths <= 0) {
    return MAKE_WHOLE_MAX_WINDOW_MONTHS;
  }
  return Math.min(durationMonths, MAKE_WHOLE_MAX_WINDOW_MONTHS);
}

/**
 * How many months of a comp we make the referring affiliate whole for. A comp is
 * fully free (newPrice = 0), so the affiliate earns nothing on it; we owe them
 * their commission for the comp period, but only within their REMAINING window:
 *
 *   payableMonths = clamp0(min(compMonths, windowMonths - monthsAlreadyPaid))
 *
 * so we never pay past their normal duration or double-count months they already
 * earned on real paid orders. `windowMonths` is the caller's already-capped
 * window (see makeWholeWindowMonths); a 0 or negative result means "nothing owed".
 */
export function compMakeWholePayableMonths(input: {
  compMonths: number;
  windowMonths: number;
  monthsAlreadyPaid: number;
}): number {
  const comp = Number.isFinite(input.compMonths) ? Math.max(0, Math.floor(input.compMonths)) : 0;
  const window = Number.isFinite(input.windowMonths) ? Math.max(0, Math.floor(input.windowMonths)) : 0;
  const paid = Number.isFinite(input.monthsAlreadyPaid) ? Math.max(0, Math.floor(input.monthsAlreadyPaid)) : 0;
  return Math.max(0, Math.min(comp, window - paid));
}

export type AdjustmentRow = {
  id: string;
  amountCents: number;
  note: string | null;
  source: string | null;
  period: string | null;
  createdAt: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromClient = { from: (table: string) => any };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Loads OPEN (reconciled_at null) adjustments grouped by affiliate user id.
 * Best-effort: the table lives on a manual-apply migration that can lag prod, so
 * a read error yields an empty map rather than throwing.
 */
export async function loadOpenAdjustmentsByUser(
  client: FromClient,
): Promise<Map<string, AdjustmentRow[]>> {
  const byUser = new Map<string, AdjustmentRow[]>();
  try {
    const { data, error } = await client
      .from("affiliate_commission_adjustments")
      .select("id,user_id,amount_cents,note,source,period,created_at")
      .is("reconciled_at", null);
    if (error) {
      console.error("loadOpenAdjustmentsByUser: read failed", error);
      return byUser;
    }
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const uid = str(row.user_id);
      if (!uid) continue;
      const adj: AdjustmentRow = {
        id: str(row.id) ?? "",
        amountCents: typeof row.amount_cents === "number" ? row.amount_cents : 0,
        note: str(row.note),
        source: str(row.source),
        period: str(row.period),
        createdAt: str(row.created_at),
      };
      const list = byUser.get(uid);
      if (list) list.push(adj);
      else byUser.set(uid, [adj]);
    }
  } catch (error) {
    console.error("loadOpenAdjustmentsByUser: threw", error);
  }
  return byUser;
}

/** Sum of a set of adjustment amounts, in cents. */
export function sumAdjustmentsCents(adjustments: AdjustmentRow[] | undefined): number {
  return (adjustments ?? []).reduce((s, a) => s + (a.amountCents || 0), 0);
}
