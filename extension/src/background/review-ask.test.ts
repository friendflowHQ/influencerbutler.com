import { describe, expect, it } from "vitest";
import {
  DEFAULT_REVIEW_ASK_STATE,
  applyAnswer,
  dayKey,
  isReviewAskDue,
  normalizeReviewAsk,
  withActiveDay,
  type ReviewAskState,
} from "./review-ask";
import {
  REVIEW_ASK_MAX_ASKS,
  REVIEW_ASK_MIN_ACTIVE_DAYS,
  REVIEW_ASK_MIN_AGE_MS,
  REVIEW_ASK_SNOOZE_MS,
} from "../shared/constants";

const DAY = 24 * 60 * 60 * 1000;
const T0 = new Date(2026, 9, 1, 12, 0, 0).getTime();

const eligible = (over: Partial<ReviewAskState> = {}): ReviewAskState => ({
  ...DEFAULT_REVIEW_ASK_STATE,
  activeDays: REVIEW_ASK_MIN_ACTIVE_DAYS,
  ...over,
});

describe("withActiveDay", () => {
  it("counts a day once and returns the same object on repeats", () => {
    const first = withActiveDay(DEFAULT_REVIEW_ASK_STATE, T0);
    expect(first.activeDays).toBe(1);
    expect(first.lastActiveDay).toBe(dayKey(T0));
    expect(withActiveDay(first, T0 + 60_000)).toBe(first);
  });

  it("counts the next local day", () => {
    const first = withActiveDay(DEFAULT_REVIEW_ASK_STATE, T0);
    expect(withActiveDay(first, T0 + DAY).activeDays).toBe(2);
  });
});

describe("isReviewAskDue", () => {
  const firstUse = T0;
  const old = T0 + REVIEW_ASK_MIN_AGE_MS;

  it("is due once the install is old enough and active enough", () => {
    expect(isReviewAskDue(eligible(), firstUse, old)).toBe(true);
  });

  it("waits for the minimum age", () => {
    expect(isReviewAskDue(eligible(), firstUse, old - 1)).toBe(false);
  });

  it("waits for enough active days", () => {
    expect(isReviewAskDue(eligible({ activeDays: REVIEW_ASK_MIN_ACTIVE_DAYS - 1 }), firstUse, old)).toBe(
      false,
    );
  });

  it("is not due before first use is recorded", () => {
    expect(isReviewAskDue(eligible(), null, old)).toBe(false);
  });

  it("stays hidden while snoozed and returns after", () => {
    const snoozed = eligible({ snoozedUntil: old + DAY });
    expect(isReviewAskDue(snoozed, firstUse, old)).toBe(false);
    expect(isReviewAskDue(snoozed, firstUse, old + DAY)).toBe(true);
  });

  it("never returns once closed or at the ask cap", () => {
    expect(isReviewAskDue(eligible({ closed: true }), firstUse, old)).toBe(false);
    expect(isReviewAskDue(eligible({ asks: REVIEW_ASK_MAX_ASKS }), firstUse, old)).toBe(false);
  });
});

describe("applyAnswer", () => {
  it("closes for good on yes, no and never", () => {
    for (const answer of ["yes", "no", "never"] as const) {
      expect(applyAnswer(eligible(), answer, T0).closed).toBe(true);
    }
  });

  it("snoozes on later and counts the ask", () => {
    const next = applyAnswer(eligible(), "later", T0);
    expect(next.closed).toBe(false);
    expect(next.asks).toBe(1);
    expect(next.snoozedUntil).toBe(T0 + REVIEW_ASK_SNOOZE_MS);
  });

  it("closes after the final later", () => {
    const next = applyAnswer(eligible({ asks: REVIEW_ASK_MAX_ASKS - 1 }), "later", T0);
    expect(next.asks).toBe(REVIEW_ASK_MAX_ASKS);
    expect(next.closed).toBe(true);
  });
});

describe("normalizeReviewAsk", () => {
  it("falls back to defaults for garbage", () => {
    expect(normalizeReviewAsk(null)).toEqual(DEFAULT_REVIEW_ASK_STATE);
    expect(normalizeReviewAsk({ activeDays: -3, asks: "x", closed: "yes" })).toEqual(
      DEFAULT_REVIEW_ASK_STATE,
    );
  });

  it("keeps valid stored values", () => {
    const stored = { activeDays: 4, lastActiveDay: "2026-10-01", asks: 1, snoozedUntil: 99, closed: true };
    expect(normalizeReviewAsk(stored)).toEqual(stored);
  });
});
