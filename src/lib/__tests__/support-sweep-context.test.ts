/**
 * Summary: The support sweep skips tickets the owner took over (human-owned tag)
 * and boils the customer's log bundle down to a few error lines for the model.
 * Dependencies: vitest, ../support-sweep.
 */
import { describe, it, expect } from "vitest";
import { isHumanOwned, logDigest } from "../support-sweep";

describe("isHumanOwned", () => {
  it("detects the tag among others, case-insensitively", () => {
    expect(isHumanOwned({ id: "x", tags: "deals, Human-Owned, email" })).toBe(true);
    expect(isHumanOwned({ id: "x", tags: "human-owned" })).toBe(true);
  });
  it("ignores look-alike tags and empty tags", () => {
    expect(isHumanOwned({ id: "x", tags: "human-owned-before, auto-answered" })).toBe(false);
    expect(isHumanOwned({ id: "x", tags: "" })).toBe(false);
    expect(isHumanOwned({ id: "x" })).toBe(false);
  });
});

describe("logDigest", () => {
  it("returns an empty string for missing or blank logs", () => {
    expect(logDigest(undefined)).toBe("");
    expect(logDigest("   \n ")).toBe("");
  });
  it("keeps only error-like lines, oldest first", () => {
    const logs = ["boot ok", "ERROR facebook post failed: checkpoint", "idle", "HTTP 429 rate limit"].join("\n");
    expect(logDigest(logs)).toBe("ERROR facebook post failed: checkpoint\nHTTP 429 rate limit");
  });
  it("caps the number of lines and total length", () => {
    const logs = Array.from({ length: 50 }, (_, i) => `error number ${i}`).join("\n");
    expect(logDigest(logs, 5).split("\n")).toHaveLength(5);
    expect(logDigest(logs, 50, 40).length).toBeLessThanOrEqual(40);
  });
});
