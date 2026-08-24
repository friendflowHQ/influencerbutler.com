import { describe, expect, it } from "vitest";
import { normalizeMarketplace } from "./creators-api";

// Regression guard for the bug where a blank Marketplace field became the invalid
// PA-API param "www." ("The value www. provided in the request for Marketplace is
// invalid"). normalizeMarketplace must always yield a valid www.-prefixed domain.
describe("normalizeMarketplace", () => {
  it("defaults blank / whitespace / null / undefined to US", () => {
    expect(normalizeMarketplace("")).toBe("www.amazon.com");
    expect(normalizeMarketplace("   ")).toBe("www.amazon.com");
    expect(normalizeMarketplace(null)).toBe("www.amazon.com");
    expect(normalizeMarketplace(undefined)).toBe("www.amazon.com");
  });

  it("never emits a lone 'www.'", () => {
    expect(normalizeMarketplace("")).not.toBe("www.");
  });

  it("maps the us/usa aliases to US", () => {
    expect(normalizeMarketplace("us")).toBe("www.amazon.com");
    expect(normalizeMarketplace("USA")).toBe("www.amazon.com");
  });

  it("adds a single www. to a bare host", () => {
    expect(normalizeMarketplace("amazon.com")).toBe("www.amazon.com");
    expect(normalizeMarketplace("amazon.co.uk")).toBe("www.amazon.co.uk");
  });

  it("keeps an already www.-prefixed host as-is", () => {
    expect(normalizeMarketplace("www.amazon.com")).toBe("www.amazon.com");
    expect(normalizeMarketplace("WWW.AMAZON.DE")).toBe("www.amazon.de");
  });

  it("strips protocol and path from a pasted store URL", () => {
    expect(normalizeMarketplace("https://www.amazon.com/")).toBe("www.amazon.com");
    expect(normalizeMarketplace("http://amazon.co.jp/gp/bestsellers")).toBe(
      "www.amazon.co.jp",
    );
  });
});
