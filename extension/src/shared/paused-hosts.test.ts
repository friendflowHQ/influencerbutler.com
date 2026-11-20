import { describe, expect, it } from "vitest";
import { isHostPaused, normalizeHost, withHostPaused } from "./paused-hosts";

describe("paused hosts", () => {
  it("ignores www and case", () => {
    expect(normalizeHost("WWW.Amazon.com")).toBe("amazon.com");
    expect(isHostPaused(["amazon.com"], "www.amazon.com")).toBe(true);
    expect(isHostPaused(["amazon.com"], "www.walmart.com")).toBe(false);
    expect(isHostPaused(undefined, "amazon.com")).toBe(false);
  });
  it("adds and removes without duplicates", () => {
    const on = withHostPaused(["target.com"], "www.amazon.com", true);
    expect(on).toEqual(["target.com", "amazon.com"]);
    expect(withHostPaused(on, "amazon.com", true)).toEqual(["target.com", "amazon.com"]);
    expect(withHostPaused(on, "www.amazon.com", false)).toEqual(["target.com"]);
  });
});
