/**
 * Summary: Unit tests for hasRedeemedDiscount (no-stacking eligibility).
 * Dependencies: vitest, ../discount-eligibility.
 */

import { describe, it, expect } from "vitest";
import { hasRedeemedDiscount } from "../discount-eligibility";

type Rows = Record<string, unknown>[];

/**
 * Minimal supabase-client stub. `tables` maps a table name to the rows its
 * select should return; a table set to `"error"` simulates a missing column /
 * failed read (data null + error). Only the select -> eq -> limit chain used by
 * hasRedeemedDiscount is implemented.
 */
function stubClient(tables: Record<string, Rows | "error">) {
  return {
    from(table: string) {
      const result = tables[table];
      const payload =
        result === "error"
          ? { data: null, error: { message: "column does not exist" } }
          : { data: result ?? [], error: null };
      const chain = {
        select: () => chain,
        eq: () => chain,
        limit: () => Promise.resolve(payload),
      };
      return chain;
    },
  };
}

describe("hasRedeemedDiscount", () => {
  it("is false for an organic customer with no discount or referral", async () => {
    const client = stubClient({
      orders: [{ total: 39000, discount_code: null, discount_total_cents: 0 }],
      subscriptions: [{ ref_affiliate_code: null }],
    });
    expect(await hasRedeemedDiscount(client, "u1")).toBe(false);
  });

  it("is true when an order carries an affiliate referral code", async () => {
    const client = stubClient({
      orders: [{ ref_affiliate_code: "BETH", ref_affiliate_user_id: "aff-1" }],
      subscriptions: [],
    });
    expect(await hasRedeemedDiscount(client, "u1")).toBe(true);
  });

  it("is true when an order redeemed a discount code", async () => {
    const client = stubClient({
      orders: [{ discount_code: "WELCOME15", discount_total_cents: 5850 }],
      subscriptions: [],
    });
    expect(await hasRedeemedDiscount(client, "u1")).toBe(true);
  });

  it("is true from a positive discount_total even with no code string", async () => {
    const client = stubClient({
      orders: [{ discount_code: null, discount_total_cents: 100 }],
      subscriptions: [],
    });
    expect(await hasRedeemedDiscount(client, "u1")).toBe(true);
  });

  it("falls back to the subscription attribution when orders show nothing", async () => {
    const client = stubClient({
      orders: [{ discount_code: null, discount_total_cents: 0 }],
      subscriptions: [{ ref_affiliate_user_id: "aff-9" }],
    });
    expect(await hasRedeemedDiscount(client, "u1")).toBe(true);
  });

  it("fails open (false) when both reads error on a lagging schema", async () => {
    const client = stubClient({ orders: "error", subscriptions: "error" });
    expect(await hasRedeemedDiscount(client, "u1")).toBe(false);
  });

  it("ignores blank/whitespace discount codes", async () => {
    const client = stubClient({
      orders: [{ discount_code: "   ", discount_total_cents: 0 }],
      subscriptions: [],
    });
    expect(await hasRedeemedDiscount(client, "u1")).toBe(false);
  });
});
