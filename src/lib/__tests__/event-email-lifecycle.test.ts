/**
 * Summary: Unit tests for the pure pieces of the per-event email lifecycle:
 *   invite scheduling math, replay-due math, the invite/replay plan validators,
 *   and the default invite copy. The DB helpers (scheduleEventInvite,
 *   sendEventReplays) touch Supabase and are covered by manual QA.
 * Dependencies: vitest, @/lib/event-email-lifecycle. Pure, no env or network.
 */
import { describe, it, expect } from "vitest";
import {
  inviteScheduledAtMs,
  replayDue,
  parseInvitePlan,
  parseReplayPlan,
  defaultInviteCopy,
  eventShareUrl,
} from "@/lib/event-email-lifecycle";

const DAY = 86_400_000;
const HOUR = 3_600_000;

describe("inviteScheduledAtMs", () => {
  it("schedules daysBefore days before a far-off event", () => {
    // Event 10 days out, invite 7 days before => 3 days from now.
    expect(inviteScheduledAtMs(10 * DAY, 7, 0)).toBe(3 * DAY);
  });

  it("clamps to the review buffer when the event is sooner than daysBefore", () => {
    // Event 2 days out, invite 7 days before: target is in the past, so it
    // falls to now + the 1h buffer.
    expect(inviteScheduledAtMs(2 * DAY, 7, 0)).toBe(HOUR);
  });

  it("returns null for an event already started", () => {
    expect(inviteScheduledAtMs(500, 7, 1000)).toBeNull();
  });

  it("returns null when there is no room before the event starts", () => {
    // Event 30 min out: the 1h buffer would land after it begins.
    expect(inviteScheduledAtMs(30 * 60_000, 0, 0)).toBeNull();
  });
});

describe("replayDue", () => {
  it("is due exactly hoursAfter the end", () => {
    const end = 1_000;
    expect(replayDue(end, 3, end + 3 * HOUR)).toBe(true);
    expect(replayDue(end, 3, end + 3 * HOUR - 1)).toBe(false);
  });

  it("is false for a non-finite end", () => {
    expect(replayDue(Number.NaN, 3, Date.now())).toBe(false);
  });
});

describe("parseInvitePlan", () => {
  it("returns null when disabled, missing, or the audience is unusable", () => {
    expect(parseInvitePlan(undefined)).toBeNull();
    expect(parseInvitePlan({ enabled: false, audience: { kind: "all_contacts" } })).toBeNull();
    expect(parseInvitePlan({ audience: { kind: "nope" } })).toBeNull();
    expect(parseInvitePlan({ daysBefore: 7 })).toBeNull(); // no audience
  });

  it("parses a valid plan and clamps daysBefore", () => {
    expect(parseInvitePlan({ audience: { kind: "all_contacts" } })).toEqual({
      audience: { kind: "all_contacts" },
      daysBefore: 7,
      subject: null,
      body: null,
    });
    const plan = parseInvitePlan({
      audience: { kind: "segment", segment: "pro" },
      daysBefore: 100,
      subject: "  Come  ",
      body: "hi",
    });
    expect(plan).toEqual({
      audience: { kind: "segment", segment: "pro" },
      daysBefore: 60,
      subject: "Come",
      body: "hi",
    });
  });

  it("passes an engaged audience through the audience validator", () => {
    expect(parseInvitePlan({ audience: { kind: "engaged", minOpens: 3 } })).toEqual({
      audience: { kind: "engaged", minOpens: 3 },
      daysBefore: 7,
      subject: null,
      body: null,
    });
  });
});

describe("parseReplayPlan", () => {
  it("returns null only when the field is absent", () => {
    expect(parseReplayPlan(undefined)).toBeNull();
  });

  it("defaults enabled and hoursAfter", () => {
    expect(parseReplayPlan({})).toEqual({ enabled: true, hoursAfter: 3, subject: null, body: null });
  });

  it("carries the disabled flag and clamps hoursAfter", () => {
    expect(parseReplayPlan({ enabled: false })).toEqual({
      enabled: false,
      hoursAfter: 3,
      subject: null,
      body: null,
    });
    expect(parseReplayPlan({ hoursAfter: 999 })?.hoursAfter).toBe(240);
    expect(parseReplayPlan({ hoursAfter: 0 })?.hoursAfter).toBe(1);
  });
});

describe("defaultInviteCopy", () => {
  it("builds a subject and body that carry the title and the share link", () => {
    const start = Date.UTC(2026, 8, 18, 17, 0); // 2026-09-18 17:00Z = 11:00 MDT
    const copy = defaultInviteCopy({
      id: "abc",
      title: "Benable Butler",
      description: "Turn lists into commission.",
      startMs: start,
      endMs: start + HOUR,
      timezone: "America/Denver",
    });
    expect(copy.subject).toContain("Benable Butler");
    expect(copy.body).toContain(eventShareUrl("abc"));
    expect(copy.body).toContain("Turn lists into commission.");
    // No em dashes in generated copy (repo rule).
    expect(copy.body).not.toContain("—");
  });
});
