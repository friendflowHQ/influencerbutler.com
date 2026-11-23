import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookingPromptLines, humanFallbackLines, resolveBooking } from "@/lib/ai-concierge/agent";
import { WINBACK_COPY, type WinbackVars } from "@/lib/winback-emails";

const BEFORE = new Date("2026-12-20T12:00:00Z");
const AFTER = new Date("2027-01-10T12:00:00Z");

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("concierge booking rules follow the call policy", () => {
  it("before the start date it still offers the free Setup call", () => {
    vi.setSystemTime(BEFORE);
    const text = bookingPromptLines().join("\n");
    expect(text).toContain("free Setup call");
    expect(text).toContain("callType 'demo'");
    expect(resolveBooking({ callType: "demo" }).callTypes.map((c) => c.key)).toEqual(["demo"]);
    expect(resolveBooking({ callType: "both" }).callTypes.map((c) => c.key)).toEqual(["demo", "support"]);
  });

  it("after the start date it only ever offers the Priority 1:1, to plans that include it", () => {
    vi.setSystemTime(AFTER);
    const text = bookingPromptLines().join("\n");
    expect(text).toContain("per calendar month");
    expect(text).toContain("get_subscription");
    expect(text).toContain("never offer the Setup call");
    for (const asked of ["demo", "support", "both", undefined]) {
      expect(resolveBooking({ callType: asked }).callTypes.map((c) => c.key)).toEqual(["support"]);
    }
  });

  it("after the start date a person-request goes to self-serve help unless the plan has calls", () => {
    vi.setSystemTime(AFTER);
    const text = humanFallbackLines().join("\n");
    expect(text).toContain("/events");
    expect(text).toContain("Ask support");
  });

  it("uses no em-dashes in either version", () => {
    for (const d of [BEFORE, AFTER]) {
      vi.setSystemTime(d);
      expect([...bookingPromptLines(), ...humanFallbackLines()].join("\n")).not.toContain("—");
    }
  });
});

const VARS: WinbackVars = {
  firstName: "Sam",
  isTechnical: true,
  claimUrl: "https://example.com/claim",
  discountCode: "BACK",
  discountPercent: 20,
  checkoutUrl: "https://example.com/checkout",
};

function allWinbackBodies(): string[] {
  const out: string[] = [];
  for (const seg of Object.values(WINBACK_COPY)) {
    for (const tier of Object.values(seg)) out.push(tier.build(VARS));
  }
  return out;
}

describe("win-back emails", () => {
  it("offer the free Setup call only before the policy start date", () => {
    vi.setSystemTime(BEFORE);
    expect(allWinbackBodies().some((b) => b.includes("free 1-hour-15-minute setup call"))).toBe(true);
    vi.setSystemTime(AFTER);
    const after = allWinbackBodies();
    expect(after.some((b) => b.includes("setup call"))).toBe(false);
    expect(after.some((b) => b.includes("live group sessions"))).toBe(true);
    for (const b of after) expect(b).not.toContain("—");
  });
});
