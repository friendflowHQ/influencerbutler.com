import { describe, expect, it } from "vitest";

import {
  deriveReferredSignups,
  REFERRED_EVENTS_CAP,
  type ReferredProfileRow,
  type ReferredSubscriptionRow,
} from "../referred-signups";

function sub(overrides: Partial<ReferredSubscriptionRow>): ReferredSubscriptionRow {
  return {
    user_id: "user-1",
    status: null,
    trial_started_at: null,
    trial_converted_at: null,
    pro_started_at: null,
    ends_at: null,
    ...overrides,
  };
}

function profile(overrides: Partial<ReferredProfileRow> = {}): ReferredProfileRow {
  return { created_at: "2026-07-01T00:00:00.000Z", ref_captured_at: null, ...overrides };
}

describe("deriveReferredSignups funnel counts", () => {
  it("counts each lifecycle stage independently", () => {
    const { funnel } = deriveReferredSignups(
      [profile(), profile()],
      [
        sub({
          user_id: "u1",
          status: "active",
          trial_started_at: "2026-07-02T00:00:00.000Z",
          trial_converted_at: "2026-07-05T00:00:00.000Z",
        }),
        sub({ user_id: "u2", status: "on_trial", trial_started_at: "2026-07-10T00:00:00.000Z" }),
        sub({
          user_id: "u3",
          status: "cancelled",
          pro_started_at: "2026-06-01T00:00:00.000Z",
          ends_at: "2026-07-01T00:00:00.000Z",
        }),
      ],
    );

    expect(funnel).toEqual({
      signups: 2,
      trialsStarted: 2,
      paid: 2, // one trial conversion + one direct pro
      activeSubscriptions: 1,
      cancelled: 1,
    });
  });

  it("infers direct-Pro buys from status when pro_started_at is unavailable", () => {
    const { funnel } = deriveReferredSignups(
      [],
      [
        // Direct Pro sub from an environment lacking the 20260618 column.
        sub({ user_id: "u1", status: "active" }),
        // A trial still in progress must NOT count as paid.
        sub({ user_id: "u2", status: "on_trial", trial_started_at: "2026-07-10T00:00:00.000Z" }),
        // A trial cancelled without converting must NOT count as paid.
        sub({
          user_id: "u3",
          status: "cancelled",
          trial_started_at: "2026-07-01T00:00:00.000Z",
          ends_at: "2026-07-04T00:00:00.000Z",
        }),
      ],
    );
    expect(funnel.paid).toBe(1);
  });

  it("treats past_due as still active (a live paying customer)", () => {
    const { funnel } = deriveReferredSignups([], [sub({ status: "past_due" })]);
    expect(funnel.activeSubscriptions).toBe(1);
    expect(funnel.cancelled).toBe(0);
  });

  it("counts expired subs as ended (real LS status for a lapsed sub)", () => {
    const { funnel, events } = deriveReferredSignups(
      [],
      [
        sub({
          user_id: "u1",
          status: "expired",
          trial_started_at: "2026-07-14T00:00:00.000Z",
          trial_converted_at: "2026-07-14T12:00:00.000Z",
          ends_at: "2026-07-15T00:00:00.000Z",
        }),
      ],
    );
    expect(funnel.cancelled).toBe(1);
    expect(funnel.activeSubscriptions).toBe(0);
    expect(funnel.paid).toBe(1);
    expect(events.some((e) => e.type === "cancelled" && e.at === "2026-07-15T00:00:00.000Z")).toBe(
      true,
    );
  });

  it("dedupes subscriptions by user, preferring the row with lifecycle history", () => {
    const { funnel } = deriveReferredSignups(
      [],
      [
        // Add-on sub with no trial history should not double-count the user.
        sub({ user_id: "u1", status: "active" }),
        sub({
          user_id: "u1",
          status: "active",
          trial_started_at: "2026-07-02T00:00:00.000Z",
          trial_converted_at: "2026-07-05T00:00:00.000Z",
        }),
      ],
    );

    expect(funnel.trialsStarted).toBe(1);
    expect(funnel.paid).toBe(1);
    expect(funnel.activeSubscriptions).toBe(1);
  });
});

describe("deriveReferredSignups events", () => {
  it("builds anonymous events sorted newest first", () => {
    const { events } = deriveReferredSignups(
      [profile({ ref_captured_at: "2026-07-01T00:00:00.000Z" })],
      [
        sub({
          user_id: "u1",
          status: "active",
          trial_started_at: "2026-07-03T00:00:00.000Z",
          trial_converted_at: "2026-07-06T00:00:00.000Z",
        }),
      ],
    );

    expect(events.map((e) => e.type)).toEqual(["trial_converted", "trial_started", "signup"]);
    // Anonymous by design: only type + timestamp.
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(["at", "type"]);
    }
  });

  it("prefers ref_captured_at over created_at for the signup event", () => {
    const { events } = deriveReferredSignups(
      [
        profile({
          created_at: "2026-07-01T00:00:00.000Z",
          ref_captured_at: "2026-07-04T00:00:00.000Z",
        }),
      ],
      [],
    );
    expect(events).toEqual([{ type: "signup", at: "2026-07-04T00:00:00.000Z" }]);
  });

  it("only emits a cancelled event when status is cancelled AND ends_at exists", () => {
    const { events } = deriveReferredSignups(
      [],
      [
        sub({ user_id: "u1", status: "cancelled", ends_at: null }),
        sub({ user_id: "u2", status: "active", ends_at: "2026-08-01T00:00:00.000Z" }),
        sub({ user_id: "u3", status: "cancelled", ends_at: "2026-07-15T00:00:00.000Z" }),
      ],
    );
    expect(events).toEqual([{ type: "cancelled", at: "2026-07-15T00:00:00.000Z" }]);
  });

  it("caps the feed at the newest REFERRED_EVENTS_CAP events", () => {
    const profiles: ReferredProfileRow[] = [];
    for (let i = 1; i <= 30; i++) {
      profiles.push(
        profile({ ref_captured_at: `2026-06-${String(i).padStart(2, "0")}T00:00:00.000Z` }),
      );
    }
    const { events } = deriveReferredSignups(profiles, []);
    expect(events).toHaveLength(REFERRED_EVENTS_CAP);
    expect(events[0].at).toBe("2026-06-30T00:00:00.000Z");
    expect(events[events.length - 1].at).toBe("2026-06-11T00:00:00.000Z");
  });

  it("skips rows with unparseable timestamps instead of emitting Invalid Date events", () => {
    const { events } = deriveReferredSignups(
      [profile({ created_at: "not-a-date", ref_captured_at: null })],
      [sub({ user_id: "u1", trial_started_at: "also-bad" })],
    );
    expect(events).toEqual([]);
  });
});
