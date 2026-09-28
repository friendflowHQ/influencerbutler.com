import { describe, expect, it } from "vitest";

import {
  deriveReferredSignups,
  REFERRED_EVENTS_MAX,
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

  it("derives insights: avg trial length, avg tenure, and plan mix", () => {
    const { insights } = deriveReferredSignups(
      [],
      [
        // Converted after 3 days, annual, still active.
        sub({
          user_id: "u1",
          status: "active",
          trial_started_at: "2026-07-01T00:00:00.000Z",
          trial_converted_at: "2026-07-04T00:00:00.000Z",
          billing_interval: "year",
        }),
        // Converted after 5 days, monthly, later cancelled after ~30 days.
        sub({
          user_id: "u2",
          status: "cancelled",
          trial_started_at: "2026-06-01T00:00:00.000Z",
          trial_converted_at: "2026-06-06T00:00:00.000Z",
          ends_at: "2026-07-06T00:00:00.000Z",
          billing_interval: "month",
        }),
      ],
    );
    expect(insights.avgDaysToConvert).toBe(4); // (3 + 5) / 2
    expect(insights.avgDaysSubscribed).toBe(30); // only the ended sub: Jun6 -> Jul6
    expect(insights.planMix).toEqual({ monthly: 1, annual: 1, other: 0 });
  });

  it("insights are null/zero when there is no paid activity", () => {
    const { insights } = deriveReferredSignups(
      [profile()],
      [sub({ status: "on_trial", trial_started_at: "2026-07-10T00:00:00.000Z" })],
    );
    expect(insights.avgDaysToConvert).toBeNull();
    expect(insights.avgDaysSubscribed).toBeNull();
    expect(insights.planMix).toEqual({ monthly: 0, annual: 0, other: 0 });
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
    // Anonymous by design: only type + timestamp + a channel label.
    for (const event of events) {
      expect(Object.keys(event).sort()).toEqual(["at", "channel", "type"]);
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
    expect(events).toEqual([{ type: "signup", at: "2026-07-04T00:00:00.000Z", channel: "web" }]);
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
    expect(events).toEqual([{ type: "cancelled", at: "2026-07-15T00:00:00.000Z", channel: "web" }]);
  });

  it("adds dated, amount-bearing comp make-whole events without touching the funnel", () => {
    const { funnel, events } = deriveReferredSignups(
      [],
      [sub({ user_id: "u1", status: "cancelled", ends_at: "2026-08-01T00:00:00.000Z" })],
      Date.parse("2026-09-15T00:00:00.000Z"),
      [
        { amountCents: 1061, at: "2026-08-01T00:00:00.000Z" },
        { amountCents: 1061, at: "2026-09-01T00:00:00.000Z" },
      ],
    );
    // Comp make-whole lines do not inflate the customer funnel counts.
    expect(funnel.cancelled).toBe(1);
    expect(funnel.paid).toBe(1);
    // Two make-whole lines carry their amount, newest first, alongside the cancel.
    const mw = events.filter((e) => e.type === "comp_makewhole");
    expect(mw.map((e) => e.amountCents)).toEqual([1061, 1061]);
    expect(mw[0].at).toBe("2026-09-01T00:00:00.000Z");
    expect(events[0].type).toBe("comp_makewhole"); // Sep 1 is the newest event
  });

  it("caps the feed at the newest REFERRED_EVENTS_MAX events", () => {
    const base = Date.parse("2026-06-01T00:00:00.000Z");
    const profiles: ReferredProfileRow[] = [];
    for (let i = 0; i < REFERRED_EVENTS_MAX + 5; i++) {
      profiles.push(profile({ ref_captured_at: new Date(base + i * 60_000).toISOString() }));
    }
    const { events } = deriveReferredSignups(profiles, []);
    expect(events).toHaveLength(REFERRED_EVENTS_MAX);
    // Newest first, and the oldest 5 are dropped by the cap.
    expect(Date.parse(events[0].at)).toBeGreaterThan(Date.parse(events[events.length - 1].at));
    expect(events[0].at).toBe(new Date(base + (REFERRED_EVENTS_MAX + 4) * 60_000).toISOString());
  });

  it("skips rows with unparseable timestamps instead of emitting Invalid Date events", () => {
    const { events } = deriveReferredSignups(
      [profile({ created_at: "not-a-date", ref_captured_at: null })],
      [sub({ user_id: "u1", trial_started_at: "also-bad" })],
    );
    expect(events).toEqual([]);
  });
});

describe("deriveReferredSignups lead source (channel)", () => {
  it("labels the signup event with the profile's channel", () => {
    const { events } = deriveReferredSignups(
      [
        profile({ user_id: "u1", ref_channel: "extension", ref_captured_at: "2026-07-01T00:00:00.000Z" }),
        profile({ user_id: "u2", ref_channel: "web", ref_captured_at: "2026-07-02T00:00:00.000Z" }),
      ],
      [],
    );
    const byUser = Object.fromEntries(events.map((e) => [e.at, e.channel]));
    expect(byUser["2026-07-01T00:00:00.000Z"]).toBe("extension");
    expect(byUser["2026-07-02T00:00:00.000Z"]).toBe("web");
  });

  it("joins the profile channel onto that account's subscription events", () => {
    const { events } = deriveReferredSignups(
      [profile({ user_id: "u1", ref_channel: "extension", ref_captured_at: "2026-07-01T00:00:00.000Z" })],
      [
        sub({
          user_id: "u1",
          status: "active",
          trial_started_at: "2026-07-03T00:00:00.000Z",
          trial_converted_at: "2026-07-06T00:00:00.000Z",
        }),
      ],
    );
    // Every event for this account wears the account's captured source.
    for (const event of events) expect(event.channel).toBe("extension");
  });

  it("defaults to web when the channel is absent or the account was a direct checkout", () => {
    const { events } = deriveReferredSignups(
      // No ref_channel (pre-migration) and no matching profile for the sub user.
      [profile({ user_id: "u1", ref_captured_at: "2026-07-01T00:00:00.000Z" })],
      [sub({ user_id: "u2", status: "active", pro_started_at: "2026-07-02T00:00:00.000Z" })],
    );
    for (const event of events) expect(event.channel).toBe("web");
  });

  it("counts signups by source", () => {
    const { insights } = deriveReferredSignups(
      [
        profile({ user_id: "u1", ref_channel: "extension" }),
        profile({ user_id: "u2", ref_channel: "extension" }),
        profile({ user_id: "u3", ref_channel: "web" }),
        profile({ user_id: "u4", ref_channel: null }), // legacy -> web
      ],
      [],
    );
    expect(insights.bySource).toEqual({ web: 2, extension: 2, desktop: 0 });
  });
});

describe("deriveReferredSignups conversion rates and momentum", () => {
  it("computes funnel conversion percentages, null when the denominator is 0", () => {
    const { insights } = deriveReferredSignups(
      [profile(), profile(), profile(), profile()], // 4 signups
      [
        sub({ user_id: "u1", status: "active", trial_started_at: "2026-07-02T00:00:00.000Z", trial_converted_at: "2026-07-05T00:00:00.000Z" }),
        sub({ user_id: "u2", status: "on_trial", trial_started_at: "2026-07-03T00:00:00.000Z" }),
      ],
    );
    // 2 trials / 4 signups = 50%; 1 paid / 2 trials = 50%.
    expect(insights.conversionRates.signupToTrial).toBe(50);
    expect(insights.conversionRates.trialToPaid).toBe(50);

    const { insights: none } = deriveReferredSignups([], []);
    expect(none.conversionRates.signupToTrial).toBeNull();
    expect(none.conversionRates.trialToPaid).toBeNull();
  });

  it("buckets signups and conversions into this vs last calendar month", () => {
    const now = Date.parse("2026-08-15T00:00:00.000Z");
    const { insights } = deriveReferredSignups(
      [
        profile({ ref_captured_at: "2026-08-10T00:00:00.000Z" }), // this month
        profile({ ref_captured_at: "2026-07-20T00:00:00.000Z" }), // last month
        profile({ ref_captured_at: "2026-06-01T00:00:00.000Z" }), // older, ignored
      ],
      [
        // Converted this month.
        sub({ user_id: "u1", status: "active", trial_started_at: "2026-08-01T00:00:00.000Z", trial_converted_at: "2026-08-05T00:00:00.000Z" }),
        // Direct pro start last month.
        sub({ user_id: "u2", status: "active", pro_started_at: "2026-07-10T00:00:00.000Z" }),
      ],
      now,
    );
    expect(insights.thisMonth).toEqual({ signups: 1, conversions: 1 });
    expect(insights.lastMonth).toEqual({ signups: 1, conversions: 1 });
  });

  it("handles the December to January month rollover", () => {
    const now = Date.parse("2026-01-15T00:00:00.000Z");
    const { insights } = deriveReferredSignups(
      [
        profile({ ref_captured_at: "2026-01-05T00:00:00.000Z" }), // this month
        profile({ ref_captured_at: "2025-12-20T00:00:00.000Z" }), // last month
      ],
      [],
      now,
    );
    expect(insights.thisMonth.signups).toBe(1);
    expect(insights.lastMonth.signups).toBe(1);
  });
});
