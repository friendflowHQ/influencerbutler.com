import { describe, it, expect } from "vitest";
import {
  CALL_TOPICS,
  MAX_TOPICS,
  guessTopics,
  isMissingTopicsColumn,
  sanitizeTopics,
  topicLabelsText,
  topicsForBooking,
} from "../call-topics";
import { hasConflict } from "../scheduling";

describe("sanitizeTopics", () => {
  it("keeps known keys, drops unknown and non-string values", () => {
    expect(sanitizeTopics(["foyer", "nope", 3, null, "instagram"])).toEqual(["foyer", "instagram"]);
  });
  it("de-duplicates and trims", () => {
    expect(sanitizeTopics([" foyer ", "foyer"])).toEqual(["foyer"]);
  });
  it("caps at MAX_TOPICS, keeping the first picks", () => {
    const all = CALL_TOPICS.map((t) => t.key);
    expect(sanitizeTopics(all)).toEqual(all.slice(0, MAX_TOPICS));
  });
  it("returns [] for anything that is not an array", () => {
    expect(sanitizeTopics("foyer")).toEqual([]);
    expect(sanitizeTopics(undefined)).toEqual([]);
    expect(sanitizeTopics({ 0: "foyer" })).toEqual([]);
  });
});

describe("guessTopics (legacy free-text rows)", () => {
  it("maps the real rows from the schedule", () => {
    expect(guessTopics("Facebook Deals Set-up")).toEqual(["facebook-deals"]);
    expect(guessTopics("Foyer Butler")).toEqual(["foyer"]);
  });
  it("returns nothing for empty or unrelated text", () => {
    expect(guessTopics("")).toEqual([]);
    expect(guessTopics(null)).toEqual([]);
    expect(guessTopics("Everything lol. I'm going to try to figure out what I can")).toEqual([]);
  });
  it("never suggests more than MAX_TOPICS", () => {
    expect(guessTopics("facebook instagram foyer youtube amazon walmart extension billing broken").length).toBeLessThanOrEqual(MAX_TOPICS);
  });
});

describe("topicsForBooking", () => {
  it("prefers the customer's picks and marks them as not guessed", () => {
    const t = topicsForBooking({ topics: ["billing"], topic: "foyer stuff" });
    expect(t.map((x) => x.key)).toEqual(["billing"]);
    expect(t[0].guessed).toBe(false);
  });
  it("falls back to guesses, flagged as guessed", () => {
    const t = topicsForBooking({ topics: [], topic: "Foyer Butler" });
    expect(t.map((x) => x.key)).toEqual(["foyer"]);
    expect(t[0].guessed).toBe(true);
  });
  it("handles a missing topics column (undefined)", () => {
    expect(topicsForBooking({ topic: null })).toEqual([]);
  });
});

describe("topicLabelsText", () => {
  it("joins labels for plain-text emails and ignores junk", () => {
    expect(topicLabelsText(["foyer", "bogus", "billing"])).toBe("Foyer Butler, Billing or plan");
    expect(topicLabelsText(undefined)).toBe("");
  });
});

describe("isMissingTopicsColumn", () => {
  it("detects the Postgres and PostgREST missing-column errors", () => {
    expect(isMissingTopicsColumn({ code: "42703", message: 'column call_bookings.topics does not exist' })).toBe(true);
    expect(isMissingTopicsColumn({ code: "PGRST204", message: "Could not find the 'topics' column of 'call_bookings' in the schema cache" })).toBe(true);
  });
  it("does not swallow unrelated errors", () => {
    expect(isMissingTopicsColumn({ code: "42703", message: "column call_bookings.recording_status does not exist" })).toBe(false);
    expect(isMissingTopicsColumn({ code: "23505", message: "duplicate key" })).toBe(false);
    expect(isMissingTopicsColumn(null)).toBe(false);
  });
});

describe("hasConflict (reschedule overlap check)", () => {
  const busy = [{ startMs: 1000, endMs: 2000 }];
  it("flags overlapping ranges", () => {
    expect(hasConflict(1500, 2500, busy)).toBe(true);
    expect(hasConflict(500, 1500, busy)).toBe(true);
    expect(hasConflict(1200, 1300, busy)).toBe(true);
  });
  it("allows touching edges and clear gaps", () => {
    expect(hasConflict(2000, 3000, busy)).toBe(false);
    expect(hasConflict(0, 1000, busy)).toBe(false);
    expect(hasConflict(5000, 6000, busy)).toBe(false);
  });
});
