import { describe, expect, it } from "vitest";
import {
  CALL_POLICY_CODES,
  CALL_POLICY_DEFAULT_START_ISO,
  MONTHLY_SUPPORT_CALL_LIMIT,
  callPolicyActive,
  callPolicyStartMs,
  checkCallPolicy,
  planIncludesCalls,
  utcMonthBounds,
} from "@/lib/call-policy";

const BEFORE = Date.parse("2026-12-31T23:59:59Z");
const AFTER = Date.parse("2027-01-05T12:00:00Z");

describe("callPolicyStartMs", () => {
  it("defaults to the start of 2027 (UTC)", () => {
    expect(callPolicyStartMs("")).toBe(Date.parse(CALL_POLICY_DEFAULT_START_ISO));
    expect(callPolicyStartMs("not a date")).toBe(Date.parse(CALL_POLICY_DEFAULT_START_ISO));
  });
  it("can be moved with an ISO date", () => {
    expect(callPolicyStartMs("2026-12-15T00:00:00Z")).toBe(Date.parse("2026-12-15T00:00:00Z"));
    expect(callPolicyActive(BEFORE, "2026-12-15T00:00:00Z")).toBe(true);
  });
  it("is off before the start and on at it", () => {
    expect(callPolicyActive(BEFORE, "")).toBe(false);
    expect(callPolicyActive(Date.parse(CALL_POLICY_DEFAULT_START_ISO), "")).toBe(true);
  });
});

describe("planIncludesCalls", () => {
  it("includes every Power User seat count and the legacy Team and Agency plans", () => {
    for (const p of ["power-solo-monthly", "power-trio-annual", "power-team-monthly", "power-agency-annual", "team-monthly", "team-annual", "agency-monthly", "agency-annual"]) {
      expect(planIncludesCalls(p)).toBe(true);
    }
  });
  it("excludes Beginner, legacy Solo and Duo, add-ons and unknown variants", () => {
    for (const p of ["beginner-solo-monthly", "beginner-trio-annual", "solo-monthly", "duo-annual", "daily-deals-addon", "", null, undefined]) {
      expect(planIncludesCalls(p as string | null | undefined)).toBe(false);
    }
  });
});

describe("utcMonthBounds", () => {
  it("returns the UTC calendar month around an instant", () => {
    expect(utcMonthBounds(Date.parse("2027-02-14T09:00:00Z"))).toEqual({
      fromIso: "2027-02-01T00:00:00.000Z",
      toIso: "2027-03-01T00:00:00.000Z",
    });
  });
  it("rolls the year over in December", () => {
    expect(utcMonthBounds(Date.parse("2027-12-31T23:00:00Z")).toIso).toBe("2028-01-01T00:00:00.000Z");
  });
});

describe("checkCallPolicy before the start date", () => {
  it("changes nothing for any call type", () => {
    expect(checkCallPolicy({ type: "demo", now: BEFORE, plan: null, supportBookingsInMonth: 0 })).toEqual({ ok: true });
    expect(checkCallPolicy({ type: "support", now: BEFORE, plan: "beginner-solo-monthly", supportBookingsInMonth: 5 })).toEqual({ ok: true });
  });
});

describe("checkCallPolicy after the start date", () => {
  it("ends the free Setup call and points to the paid session when a link is set", () => {
    const v = checkCallPolicy({ type: "demo", now: AFTER, plan: null, supportBookingsInMonth: 0, setupSessionUrl: "https://example.com/buy" });
    expect(v).toMatchObject({ ok: false, status: 403, code: CALL_POLICY_CODES.setupCallPaid });
    if (!v.ok) {
      expect(v.error).toContain("https://example.com/buy");
      expect(v.error).not.toContain("—");
    }
  });
  it("still ends the Setup call with no checkout link configured", () => {
    const v = checkCallPolicy({ type: "demo", now: AFTER, plan: "power-solo-monthly", supportBookingsInMonth: 0 });
    expect(v).toMatchObject({ ok: false, code: CALL_POLICY_CODES.setupCallPaid });
    if (!v.ok) expect(v.error).not.toContain("undefined");
  });
  it("leaves partner-reserved Setup slots alone", () => {
    expect(checkCallPolicy({ type: "demo", now: AFTER, plan: null, supportBookingsInMonth: 0, partnerReserved: true })).toEqual({ ok: true });
  });
  it("lets Power User, Team and Agency book their first call of the month", () => {
    for (const plan of ["power-solo-monthly", "power-trio-annual", "team-monthly", "agency-annual"]) {
      expect(checkCallPolicy({ type: "support", now: AFTER, plan, supportBookingsInMonth: 0 })).toEqual({ ok: true });
    }
  });
  it("refuses plans without calls, including customers with no plan at all", () => {
    for (const plan of ["beginner-solo-monthly", "solo-monthly", "duo-monthly", null]) {
      expect(checkCallPolicy({ type: "support", now: AFTER, plan, supportBookingsInMonth: 0 })).toMatchObject({ ok: false, status: 403, code: CALL_POLICY_CODES.notInPlan });
    }
  });
  it("refuses a second call in the same month", () => {
    expect(MONTHLY_SUPPORT_CALL_LIMIT).toBe(1);
    expect(checkCallPolicy({ type: "support", now: AFTER, plan: "power-solo-monthly", supportBookingsInMonth: 1 })).toMatchObject({ ok: false, status: 409, code: CALL_POLICY_CODES.monthlyLimit });
  });
  it("checks the plan before the monthly count", () => {
    expect(checkCallPolicy({ type: "support", now: AFTER, plan: "beginner-solo-monthly", supportBookingsInMonth: 3 })).toMatchObject({ code: CALL_POLICY_CODES.notInPlan });
  });
  it("uses no em-dashes in any customer message", () => {
    const msgs = [
      checkCallPolicy({ type: "demo", now: AFTER, plan: null, supportBookingsInMonth: 0 }),
      checkCallPolicy({ type: "support", now: AFTER, plan: null, supportBookingsInMonth: 0 }),
      checkCallPolicy({ type: "support", now: AFTER, plan: "power-solo-monthly", supportBookingsInMonth: 1 }),
    ];
    for (const m of msgs) {
      expect(m.ok).toBe(false);
      if (!m.ok) expect(m.error).not.toContain("—");
    }
  });
});
