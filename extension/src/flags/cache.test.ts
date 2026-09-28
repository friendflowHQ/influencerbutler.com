import { describe, expect, it } from "vitest";
import { sanitizeFlags } from "./cache";

describe("sanitizeFlags", () => {
  it("fills every field from an empty or non-object payload", () => {
    const empty = sanitizeFlags({});
    expect(empty).toEqual({
      version: "",
      disableAll: false,
      disabledTools: [],
      selectorOverrides: {},
      notice: null,
    });
    expect(sanitizeFlags(null)).toEqual(empty);
    expect(sanitizeFlags("garbage")).toEqual(empty);
    expect(sanitizeFlags(undefined)).toEqual(empty);
  });

  it("keeps a well-formed payload", () => {
    const out = sanitizeFlags({
      version: "abc123",
      disableAll: true,
      disabledTools: ["storefront", "searchOverlay"],
      selectorOverrides: { searchResultTile: ["div.s-result-item[data-asin]"] },
      notice: "Paused while Amazon settles a change.",
    });
    expect(out.version).toBe("abc123");
    expect(out.disableAll).toBe(true);
    expect(out.disabledTools).toEqual(["storefront", "searchOverlay"]);
    expect(out.selectorOverrides).toEqual({
      searchResultTile: ["div.s-result-item[data-asin]"],
    });
    expect(out.notice).toBe("Paused while Amazon settles a change.");
  });

  it("coerces disableAll to a strict boolean", () => {
    expect(sanitizeFlags({ disableAll: "true" }).disableAll).toBe(false);
    expect(sanitizeFlags({ disableAll: 1 }).disableAll).toBe(false);
    expect(sanitizeFlags({ disableAll: true }).disableAll).toBe(true);
  });

  it("drops non-string and blank entries in disabledTools and trims them", () => {
    const out = sanitizeFlags({ disabledTools: ["  storefront  ", "", 42, null, "searchOverlay"] });
    expect(out.disabledTools).toEqual(["storefront", "searchOverlay"]);
  });

  it("drops selector overrides with no usable selectors and trims the rest", () => {
    const out = sanitizeFlags({
      selectorOverrides: {
        searchResultTile: ["  .a  ", "", 7],
        broken: [],
        alsoBroken: "not-an-array",
      },
    });
    expect(out.selectorOverrides).toEqual({ searchResultTile: [".a"] });
  });

  it("normalizes a blank or non-string notice to null", () => {
    expect(sanitizeFlags({ notice: "   " }).notice).toBeNull();
    expect(sanitizeFlags({ notice: 5 }).notice).toBeNull();
    expect(sanitizeFlags({ notice: "  hi  " }).notice).toBe("hi");
  });

  it("caps oversized inputs so a bad payload cannot bloat storage", () => {
    const tools = Array.from({ length: 200 }, (_, i) => `t${i}`);
    const selectors = Array.from({ length: 100 }, (_, i) => `.s${i}`);
    const out = sanitizeFlags({
      disabledTools: tools,
      selectorOverrides: { searchResultTile: selectors },
    });
    expect(out.disabledTools.length).toBe(50);
    expect(out.selectorOverrides.searchResultTile?.length).toBe(12);
  });
});
