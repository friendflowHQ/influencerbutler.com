import { describe, expect, it } from "vitest";
import {
  CALL_PREP_REQUIRED_CODE,
  CALL_PREP_SETUP_CODE,
  callPrepRequired,
  checkCallPrep,
  parseCallPrep,
} from "@/lib/call-prep";
import { ONBOARDING_VOCAB } from "@/lib/funnel-types";

const Q = { blocker: "deals", tried: ["tutorial"], experience: "new", share: "yes" };

describe("parseCallPrep", () => {
  it("needs every question answered from the fixed vocabulary", () => {
    expect(parseCallPrep({ questionnaire: Q })).toMatchObject({ blocker: "deals", tried: ["tutorial"], billing: false });
    expect(parseCallPrep({ questionnaire: { ...Q, blocker: "<b>x</b>" } })).toBeNull();
    expect(parseCallPrep({ questionnaire: { ...Q, tried: ["nope"] } })).toBeNull();
    expect(parseCallPrep({ questionnaire: { blocker: "deals" } })).toBeNull();
    expect(parseCallPrep(null)).toBeNull();
    expect(parseCallPrep("x")).toBeNull();
  });

  it("clamps the setup counts and dedupes tried", () => {
    const p = parseCallPrep({ questionnaire: { ...Q, tried: ["tutorial", "tutorial", "restart"] }, setup: { done: -4, total: 99999 } });
    expect(p?.tried).toEqual(["tutorial", "restart"]);
    expect(p?.setupDone).toBe(0);
    expect(p?.setupTotal).toBe(1000);
  });

  it("the billing path only counts when the answer is billing too", () => {
    expect(parseCallPrep({ questionnaire: { ...Q, blocker: "billing" }, reason: "billing" })?.billing).toBe(true);
    expect(parseCallPrep({ questionnaire: Q, reason: "billing" })?.billing).toBe(false);
  });
});

describe("checkCallPrep", () => {
  it("does nothing while enforcement is off, or for the website session", () => {
    expect(checkCallPrep({ viaLicenseKey: true, required: false, prep: undefined })).toEqual({ ok: true });
    expect(checkCallPrep({ viaLicenseKey: false, required: true, prep: undefined })).toEqual({ ok: true });
  });

  it("refuses a license-key booking without a complete questionnaire", () => {
    const v = checkCallPrep({ viaLicenseKey: true, required: true, prep: undefined });
    expect(v).toMatchObject({ ok: false, status: 422, code: CALL_PREP_REQUIRED_CODE });
  });

  it("refuses while required setup steps are open, unless billing", () => {
    const open = { questionnaire: Q, setup: { done: 1, total: 3 } };
    expect(checkCallPrep({ viaLicenseKey: true, required: true, prep: open })).toMatchObject({ ok: false, status: 403, code: CALL_PREP_SETUP_CODE });
    const billing = { questionnaire: { ...Q, blocker: "billing" }, setup: { done: 1, total: 3 }, reason: "billing" };
    expect(checkCallPrep({ viaLicenseKey: true, required: true, prep: billing })).toEqual({ ok: true });
  });

  it("lets a finished setup (or a Setup call with no steps) through", () => {
    expect(checkCallPrep({ viaLicenseKey: true, required: true, prep: { questionnaire: Q, setup: { done: 3, total: 3 } } })).toEqual({ ok: true });
    expect(checkCallPrep({ viaLicenseKey: true, required: true, prep: { questionnaire: Q } })).toEqual({ ok: true });
  });
});

describe("callPrepRequired", () => {
  it("is opt-in", () => {
    expect(callPrepRequired({})).toBe(false);
    expect(callPrepRequired({ CALL_PREP_REQUIRED: "1" })).toBe(true);
    expect(callPrepRequired({ CALL_PREP_REQUIRED: "true" })).toBe(false);
  });
});

describe("goal vocabulary", () => {
  it("keeps the two goals the desktop picker offers for deals influencers", () => {
    expect(ONBOARDING_VOCAB.goal).toContain("deals-quickstart");
    expect(ONBOARDING_VOCAB.goal).toContain("launch-business");
  });
});
