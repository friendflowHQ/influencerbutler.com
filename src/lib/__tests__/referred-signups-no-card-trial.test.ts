import { describe, expect, it } from "vitest";
import { noCardTrialRowsFromGrants } from "@/lib/referred-signups-data";
import { deriveReferredSignups } from "@/lib/referred-signups";

describe("no-card trials in the referred-signups funnel", () => {
  const profile = {
    created_at: "2026-11-07T10:00:00.000Z",
    ref_captured_at: "2026-11-07T10:00:05.000Z",
    user_id: "u1",
    ref_channel: "web" as const,
  };

  it("maps trial grants (by kind, or by code shape when kind is missing)", () => {
    const rows = noCardTrialRowsFromGrants([
      { user_id: "u1", issued_at: "2026-11-07T10:00:06Z", kind: "trial", discount_code: "ANAFREE14D" },
      { user_id: "u2", issued_at: "2026-11-07T11:00:00Z", discount_code: "BOBFREE14D" },
      { user_id: "u3", issued_at: "2026-11-07T12:00:00Z", kind: "creator", discount_code: "CFREE14D" },
      { user_id: "u4", issued_at: "2026-11-07T12:00:00Z", discount_code: "DFREE3M" },
      { user_id: null, issued_at: "2026-11-07T12:00:00Z", kind: "trial" },
    ]);
    expect(rows.map((r) => r.user_id)).toEqual(["u1", "u2"]);
    expect(rows[0].trial_started_at).toBe("2026-11-07T10:00:06Z");
    expect(rows[0].status).toBeNull();
  });

  it("counts a no-card trial as a trial, never as paying or cancelled", () => {
    const trials = noCardTrialRowsFromGrants([
      { user_id: "u1", issued_at: "2026-11-07T10:00:06Z", kind: "trial", discount_code: "ANAFREE14D" },
    ]);
    const { funnel, events } = deriveReferredSignups([profile], trials);
    expect(funnel).toMatchObject({
      signups: 1,
      trialsStarted: 1,
      paid: 0,
      activeSubscriptions: 0,
      cancelled: 0,
    });
    expect(events.map((e) => e.type).sort()).toEqual(["signup", "trial_started"]);
  });

  it("lets a real paid subscription for the same user win the dedupe", () => {
    const trials = noCardTrialRowsFromGrants([
      { user_id: "u1", issued_at: "2026-11-07T10:00:06Z", kind: "trial", discount_code: "ANAFREE14D" },
    ]);
    const paid = {
      user_id: "u1",
      status: "active",
      trial_started_at: null,
      trial_converted_at: null,
      pro_started_at: "2026-11-20T00:00:00Z",
      ends_at: null,
      billing_interval: "month" as const,
    };
    const { funnel } = deriveReferredSignups([profile], [paid, ...trials]);
    expect(funnel.paid).toBe(1);
    expect(funnel.activeSubscriptions).toBe(1);
  });
});
