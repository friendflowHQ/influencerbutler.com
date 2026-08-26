/**
 * Summary: Unit tests for the auto-pay partition + payout digest body.
 * Dependencies: vitest, ../affiliate-readiness, ../payout-digest-email.
 */

import { describe, it, expect } from "vitest";
import { partitionAutopay, type Readiness } from "../affiliate-readiness";
import { buildPayoutDigestBody, type PayoutDigestRow } from "../payout-digest-email";
import type { AffiliateStatement } from "../affiliate-commissions-data";

// Minimal statement: partitionAutopay only reads userId + payableCents.
function stmt(userId: string, payableCents: number): AffiliateStatement {
  return { userId, payableCents } as AffiliateStatement;
}

const READY: Readiness = { taxVerified: true, hasPaypal: true, paypalEmail: "a@b.com" };
const OPTS = { minCents: 1000, capCents: 20000 }; // $10 min, $200 cap

describe("partitionAutopay", () => {
  it("auto-pays a ready affiliate at/under the cap", () => {
    const readiness = new Map<string, Readiness>([["u1", READY]]);
    const res = partitionAutopay([stmt("u1", 5000)], readiness, OPTS);
    expect(res.toPay.map((s) => s.userId)).toEqual(["u1"]);
    expect(res.heldOverCap).toEqual([]);
    expect(res.notReady).toEqual([]);
  });

  it("holds a ready affiliate whose payable is over the cap", () => {
    const readiness = new Map<string, Readiness>([["u1", READY]]);
    const res = partitionAutopay([stmt("u1", 25000)], readiness, OPTS);
    expect(res.toPay).toEqual([]);
    expect(res.heldOverCap.map((s) => s.userId)).toEqual(["u1"]);
  });

  it("treats exactly-at-cap as payable (not held)", () => {
    const readiness = new Map<string, Readiness>([["u1", READY]]);
    const res = partitionAutopay([stmt("u1", 20000)], readiness, OPTS);
    expect(res.toPay.map((s) => s.userId)).toEqual(["u1"]);
    expect(res.heldOverCap).toEqual([]);
  });

  it("routes missing tax / missing PayPal to notReady with reasons", () => {
    const readiness = new Map<string, Readiness>([
      ["u1", { taxVerified: false, hasPaypal: true, paypalEmail: "a@b.com" }],
      ["u2", { taxVerified: true, hasPaypal: false, paypalEmail: null }],
    ]);
    const res = partitionAutopay([stmt("u1", 5000), stmt("u2", 5000)], readiness, OPTS);
    expect(res.toPay).toEqual([]);
    expect(res.notReady).toHaveLength(2);
    expect(res.notReady[0]).toMatchObject({ missingTax: true, missingPaypal: false });
    expect(res.notReady[1]).toMatchObject({ missingTax: false, missingPaypal: true });
  });

  it("omits affiliates below the minimum (still clearing) from every bucket", () => {
    const readiness = new Map<string, Readiness>([["u1", READY]]);
    const res = partitionAutopay([stmt("u1", 500)], readiness, OPTS);
    expect(res.toPay).toEqual([]);
    expect(res.heldOverCap).toEqual([]);
    expect(res.notReady).toEqual([]);
  });

  it("treats an unknown affiliate (no readiness row) as not ready", () => {
    const res = partitionAutopay([stmt("u1", 5000)], new Map(), OPTS);
    expect(res.notReady).toHaveLength(1);
    expect(res.notReady[0]).toMatchObject({ missingTax: true, missingPaypal: true });
  });
});

describe("buildPayoutDigestBody", () => {
  const rows: PayoutDigestRow[] = [
    { name: "Kay", payableCents: 5000, paypalEmail: "kay@x.com", status: "would-pay" },
    { name: "Sam", payableCents: 30000, paypalEmail: "sam@x.com", status: "held", detail: "over cap" },
  ];

  it("labels shadow mode and lists rows with amounts + PayPal", () => {
    const body = buildPayoutDigestBody(rows, { armed: false, period: "2026-08", capCents: 20000 });
    expect(body).toContain("SHADOW");
    expect(body).toContain("Would pay");
    expect(body).toContain("kay@x.com");
    expect(body).toContain("$50.00");
    expect(body).toContain("Held for manual review");
  });

  it("labels armed mode", () => {
    const body = buildPayoutDigestBody(rows, { armed: true, period: "2026-08", capCents: 20000 });
    expect(body).toContain("ARMED");
  });
});
