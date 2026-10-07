import { describe, expect, it } from "vitest";
import { loadFilters, membership } from "./cache";

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

const stored = (m: number, fill: number) => {
  const bits = new Uint8Array(m / 8).fill(fill);
  return { version: "v", m, k: 7, bitsBase64: b64(bits), fetchedAt: 0 };
};

describe("loadFilters", () => {
  it("skips a saturated filter so it cannot flag every ASIN", () => {
    const loaded = loadFilters({ cc: stored(800, 0xff) });
    expect(loaded.cc).toBeUndefined();
    expect(membership(loaded, "B0GQB1LPTR").cc).toBe(false);
  });

  it("keeps a healthy, roughly half-full filter", () => {
    const loaded = loadFilters({ spcc: stored(800, 0x0f) });
    expect(loaded.spcc).toBeDefined();
  });
});
