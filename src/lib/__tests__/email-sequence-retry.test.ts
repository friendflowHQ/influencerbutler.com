import { describe, it, expect } from "vitest";
import {
  SEQUENCE_SEND_GIVE_UP_AFTER_MS,
  SEQUENCE_SEND_MAX_FAILURES,
  SEQUENCE_SEND_RETRY_BASE_MS,
  SEQUENCE_SEND_RETRY_MAX_MS,
  sendFailureKey,
  sequenceRetryDecision,
  summarizeSendFailures,
} from "@/lib/email-marketing";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const NOW = Date.parse("2026-11-10T18:00:00Z");

describe("summarizeSendFailures", () => {
  it("groups by lowercased recipient and category with count, first and last", () => {
    const map = summarizeSendFailures([
      { recipient: "A@x.com", category: "seq_abc_s1", created_at: "2026-11-10T10:00:00Z" },
      { recipient: "a@x.com ", category: "seq_abc_s1", created_at: "2026-11-10T08:00:00Z" },
      { recipient: "a@x.com", category: "seq_abc_s1", created_at: "2026-11-10T12:00:00Z" },
      { recipient: "a@x.com", category: "seq_abc_s2", created_at: "2026-11-10T12:00:00Z" },
      { recipient: null, category: "seq_abc_s1", created_at: "2026-11-10T12:00:00Z" },
      { recipient: "b@x.com", category: "seq_abc_s1", created_at: "not a date" },
    ]);
    expect(map.size).toBe(2);
    expect(map.get(sendFailureKey("a@x.com", "seq_abc_s1"))).toEqual({
      count: 3,
      firstAt: Date.parse("2026-11-10T08:00:00Z"),
      lastAt: Date.parse("2026-11-10T12:00:00Z"),
    });
    expect(map.get(sendFailureKey("A@X.com", "seq_abc_s2"))?.count).toBe(1);
  });
});

describe("sequenceRetryDecision", () => {
  it("sends when there are no failures", () => {
    expect(sequenceRetryDecision(undefined, NOW)).toBe("send");
    expect(sequenceRetryDecision({ count: 0, firstAt: NOW, lastAt: NOW }, NOW)).toBe("send");
  });

  it("waits out an exponential backoff after each failure", () => {
    const one = { count: 1, firstAt: NOW - 5 * MIN, lastAt: NOW - 5 * MIN };
    expect(sequenceRetryDecision(one, NOW)).toBe("wait");
    expect(sequenceRetryDecision({ ...one, lastAt: NOW - SEQUENCE_SEND_RETRY_BASE_MS }, NOW)).toBe(
      "send",
    );
    // Third failure: 4x the base.
    const three = { count: 3, firstAt: NOW - 2 * HOUR, lastAt: NOW - 30 * MIN };
    expect(sequenceRetryDecision(three, NOW)).toBe("wait");
    expect(sequenceRetryDecision({ ...three, lastAt: NOW - 40 * MIN }, NOW)).toBe("send");
  });

  it("caps the backoff", () => {
    const many = { count: 4, firstAt: NOW - 2 * HOUR, lastAt: NOW - SEQUENCE_SEND_RETRY_MAX_MS };
    expect(sequenceRetryDecision({ ...many, count: 40 }, NOW)).not.toBe("wait");
  });

  it("gives up only after enough failures over a long enough span", () => {
    const old = NOW - SEQUENCE_SEND_GIVE_UP_AFTER_MS;
    expect(
      sequenceRetryDecision(
        { count: SEQUENCE_SEND_MAX_FAILURES, firstAt: old, lastAt: NOW - HOUR },
        NOW,
      ),
    ).toBe("give_up");
    // Many failures in a short outage: never give up, just back off.
    expect(
      sequenceRetryDecision({ count: 30, firstAt: NOW - 3 * HOUR, lastAt: NOW - MIN }, NOW),
    ).toBe("wait");
    // Old but too few failures: keep trying.
    expect(
      sequenceRetryDecision(
        { count: SEQUENCE_SEND_MAX_FAILURES - 1, firstAt: old - HOUR, lastAt: NOW - 7 * HOUR },
        NOW,
      ),
    ).toBe("send");
  });
});
