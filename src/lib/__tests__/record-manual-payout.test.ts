/**
 * Summary: Unit tests for recordManualPayout (out-of-band affiliate payment
 * recording that reuses the PayPal-path incremental reconcile).
 * Dependencies: vitest, ../paypal-payouts, mocked commissions loader + email/paypal.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the commission engine so we can hand the recorder a known payable slice.
const loadAffiliateCommissions = vi.fn();
vi.mock("@/lib/affiliate-commissions-data", () => ({
  loadAffiliateCommissions: (...args: unknown[]) => loadAffiliateCommissions(...args),
}));
// Avoid pulling real email / PayPal SDK side effects at import time.
const sendAffiliatePaymentSent = vi.fn();
vi.mock("@/lib/commission-statement-email", () => ({
  sendAffiliatePaymentSent: (...args: unknown[]) => sendAffiliatePaymentSent(...args),
}));
vi.mock("@/lib/paypal", () => ({
  createPayoutBatch: vi.fn(),
  paypalConfigured: () => true,
}));

import { recordManualPayout } from "../paypal-payouts";

// A tiny chainable Supabase stand-in: every builder method returns a thenable
// proxy, and terminal reads resolve through `router`. Records inserts/updates.
type Ctx = {
  table: string;
  op?: "select" | "insert" | "update";
  payload?: Record<string, unknown>;
  filters: Array<[string, ...unknown[]]>;
};

function makeAdmin(router: (ctx: Ctx) => { data?: unknown; error?: unknown }) {
  const inserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; payload: Record<string, unknown>; filters: Ctx["filters"] }> = [];

  function build(ctx: Ctx): unknown {
    const settle = () => Promise.resolve(router(ctx));
    const handler: ProxyHandler<object> = {
      get(_t, prop) {
        if (prop === "then") {
          const p = settle();
          return p.then.bind(p);
        }
        if (prop === "maybeSingle" || prop === "single") {
          return () => settle();
        }
        return (...args: unknown[]) => {
          const next: Ctx = { ...ctx, filters: [...ctx.filters] };
          if (prop === "insert") {
            next.op = "insert";
            next.payload = args[0] as Record<string, unknown>;
            inserts.push({ table: ctx.table, payload: next.payload });
          } else if (prop === "update") {
            next.op = "update";
            next.payload = args[0] as Record<string, unknown>;
          } else if (prop === "select") {
            if (!next.op) next.op = "select";
          } else if (["eq", "neq", "is", "in"].includes(prop as string)) {
            next.filters.push([prop as string, ...args]);
            if (next.op === "update") {
              updates.push({ table: next.table, payload: next.payload ?? {}, filters: next.filters });
            }
          }
          return build(next);
        };
      },
    };
    return new Proxy({}, handler);
  }

  const admin = { from: (table: string) => build({ table, filters: [] }) };
  return { admin, inserts, updates };
}

function filterVal(filters: Ctx["filters"], col: string): unknown {
  const f = filters.find((x) => x[0] === "eq" && x[1] === col);
  return f ? f[2] : undefined;
}

const USER = "aff-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordManualPayout", () => {
  it("records exactly the payable slice and reconciles incrementally", async () => {
    loadAffiliateCommissions.mockResolvedValue({
      statements: [
        {
          userId: USER,
          payableCents: 2885,
          payableLines: [
            { lsOrderId: "A", payableNowCents: 1500, fullOwedCents: 1500 }, // monthly: fully paid
            { lsOrderId: "B", payableNowCents: 1385, fullOwedCents: 30000 }, // annual: one slice
          ],
          adjustments: [],
        },
      ],
    });

    const ordersById: Record<string, { reconciled_amount_cents: number; payout_id: string | null }> = {
      A: { reconciled_amount_cents: 0, payout_id: null },
      B: { reconciled_amount_cents: 0, payout_id: null },
    };

    const { admin, inserts, updates } = makeAdmin((ctx) => {
      if (ctx.table === "profiles") return { data: { is_affiliate: true, paypal_email: "k@x.com" }, error: null };
      if (ctx.table === "affiliate_payouts" && ctx.op === "insert")
        return { data: { id: "payout-1", status: "pending" }, error: null };
      if (ctx.table === "affiliate_payouts" && ctx.op === "select")
        return { data: { adjustment_ids: null }, error: null };
      if (ctx.table === "affiliate_payouts" && ctx.op === "update") return { error: null };
      if (ctx.table === "orders" && ctx.op === "select") {
        const id = String(filterVal(ctx.filters, "ls_order_id"));
        return { data: ordersById[id] ?? null, error: null };
      }
      if (ctx.table === "orders" && ctx.op === "update") return { error: null };
      if (ctx.table === "affiliate_applications") return { data: null, error: null };
      return { data: null, error: null };
    });

    const out = await recordManualPayout({
      admin: admin as never,
      actorEmail: "admin@x.com",
      userId: USER,
      period: "2026-09",
    });

    expect(out.ok).toBe(true);
    if (out.ok) expect(out.grossCents).toBe(2885);

    // Ledger row: the exact slice, status pending (applyPayoutStatus flips it), manual note.
    const ledger = inserts.find((i) => i.table === "affiliate_payouts");
    expect(ledger?.payload.gross_cents).toBe(2885);
    expect(ledger?.payload.status).toBe("pending");
    expect(String(ledger?.payload.fee_note)).toContain("Recorded manually");
    expect((ledger?.payload.order_ids as unknown[]).length).toBe(2);

    // Order A fully paid -> stamped reconciled_at. Order B (annual) only accrues
    // its slice and stays unstamped, so the remainder keeps vesting.
    const orderUpdates = updates.filter((u) => u.table === "orders");
    const aUpd = orderUpdates.find((u) => filterVal(u.filters, "ls_order_id") === "A");
    const bUpd = orderUpdates.find((u) => filterVal(u.filters, "ls_order_id") === "B");
    expect(aUpd?.payload.reconciled_amount_cents).toBe(1500);
    expect(aUpd?.payload.reconciled_at).toBeTruthy();
    expect(bUpd?.payload.reconciled_amount_cents).toBe(1385);
    expect(bUpd?.payload.reconciled_at).toBeUndefined();

    // No receipt email by default (affiliate already got PayPal's own notice).
    expect(sendAffiliatePaymentSent).not.toHaveBeenCalled();
  });

  it("rejects when nothing is cleared past the hold (below minimum)", async () => {
    loadAffiliateCommissions.mockResolvedValue({
      statements: [{ userId: USER, payableCents: 500, payableLines: [], adjustments: [] }],
    });
    const { admin, inserts } = makeAdmin((ctx) =>
      ctx.table === "profiles" ? { data: { is_affiliate: true, paypal_email: "" }, error: null } : { data: null, error: null },
    );

    const out = await recordManualPayout({ admin: admin as never, actorEmail: "a@x.com", userId: USER, period: "2026-09" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("below_minimum");
    expect(inserts.length).toBe(0); // never touched the ledger
  });

  it("is idempotent: a duplicate month is rejected (unique sender_batch_id)", async () => {
    loadAffiliateCommissions.mockResolvedValue({
      statements: [
        { userId: USER, payableCents: 2885, payableLines: [{ lsOrderId: "A", payableNowCents: 2885, fullOwedCents: 2885 }], adjustments: [] },
      ],
    });
    const { admin } = makeAdmin((ctx) => {
      if (ctx.table === "profiles") return { data: { is_affiliate: true, paypal_email: "k@x.com" }, error: null };
      if (ctx.table === "affiliate_payouts" && ctx.op === "insert") return { data: null, error: { code: "23505" } };
      if (ctx.table === "affiliate_payouts" && ctx.op === "select") return { data: { id: "existing", status: "success" }, error: null };
      return { data: null, error: null };
    });

    const out = await recordManualPayout({ admin: admin as never, actorEmail: "a@x.com", userId: USER, period: "2026-09" });
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe("already_recorded");
      expect(out.existing?.id).toBe("existing");
    }
  });
});
