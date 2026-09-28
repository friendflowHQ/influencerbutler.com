import { afterEach, describe, expect, it } from "vitest";
import { readExtensionFlags, versionOf } from "@/lib/extension-flags";

const ORIGINAL = process.env.EXTENSION_FLAGS;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.EXTENSION_FLAGS;
  else process.env.EXTENSION_FLAGS = ORIGINAL;
});

describe("readExtensionFlags", () => {
  it("serves empty flags when the env var is unset", () => {
    delete process.env.EXTENSION_FLAGS;
    const flags = readExtensionFlags();
    expect(flags.disableAll).toBe(false);
    expect(flags.disabledTools).toEqual([]);
    expect(flags.selectorOverrides).toEqual({});
    expect(flags.notice).toBeNull();
    expect(flags.version).toBe(versionOf({
      disableAll: false,
      disabledTools: [],
      selectorOverrides: {},
      notice: null,
    }));
  });

  it("serves empty flags (not a throw) when the env var is invalid JSON", () => {
    process.env.EXTENSION_FLAGS = "{ not json";
    const flags = readExtensionFlags();
    expect(flags.disableAll).toBe(false);
    expect(flags.disabledTools).toEqual([]);
  });

  it("parses and normalizes a well-formed flag config", () => {
    process.env.EXTENSION_FLAGS = JSON.stringify({
      disableAll: false,
      disabledTools: ["  storefront  ", "", 9, "searchOverlay"],
      selectorOverrides: { searchResultTile: ["  div.s-result-item[data-asin]  ", ""] },
      notice: "  Paused briefly.  ",
    });
    const flags = readExtensionFlags();
    expect(flags.disabledTools).toEqual(["storefront", "searchOverlay"]);
    expect(flags.selectorOverrides).toEqual({
      searchResultTile: ["div.s-result-item[data-asin]"],
    });
    expect(flags.notice).toBe("Paused briefly.");
    expect(flags.version).toHaveLength(16);
  });

  it("gives a stable version for equal payloads and a different one when flags change", () => {
    process.env.EXTENSION_FLAGS = JSON.stringify({ disabledTools: ["storefront"] });
    const a = readExtensionFlags().version;
    const b = readExtensionFlags().version;
    expect(a).toBe(b);

    process.env.EXTENSION_FLAGS = JSON.stringify({ disabledTools: ["storefront", "searchOverlay"] });
    expect(readExtensionFlags().version).not.toBe(a);
  });

  it("treats disableAll as a strict boolean", () => {
    process.env.EXTENSION_FLAGS = JSON.stringify({ disableAll: "yes" });
    expect(readExtensionFlags().disableAll).toBe(false);
    process.env.EXTENSION_FLAGS = JSON.stringify({ disableAll: true });
    expect(readExtensionFlags().disableAll).toBe(true);
  });
});
