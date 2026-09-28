import { describe, expect, it } from "vitest";
import { isPlausibleCardBox, pickOutermostSingleOwner } from "./card-scope";

// Pure card-resolution logic. The DOM walk itself (resolveCardHost,
// allProductAnchors) needs a real layout engine for getBoundingClientRect, so
// it is covered by the live smoke test on a real aggregator page; the two
// decisions that would silently put a chip in the wrong place are tested here.

describe("pickOutermostSingleOwner", () => {
  it("stops at the grid: the real savewithcindy.shop shape", () => {
    // Counts walking out of one product link: <p>, .arco-space-item,
    // .arco-space, .content-bg all own just that link, then .item-box's parent
    // grid owns 293 of them. The card is the last index still at 1.
    expect(pickOutermostSingleOwner([1, 1, 1, 1, 4, 293])).toBe(3);
  });

  it("picks the immediate parent when nothing above it qualifies", () => {
    expect(pickOutermostSingleOwner([1, 4])).toBe(0);
    expect(pickOutermostSingleOwner([1])).toBe(0);
  });

  it("gives up when even the immediate parent holds several links", () => {
    expect(pickOutermostSingleOwner([3, 12])).toBe(-1);
    expect(pickOutermostSingleOwner([])).toBe(-1);
  });
});

describe("isPlausibleCardBox", () => {
  it("accepts a real card box", () => {
    expect(isPlausibleCardBox({ width: 400, height: 638 })).toBe(true);
  });

  it("rejects wrappers a chip would land on top of the text in", () => {
    expect(isPlausibleCardBox({ width: 400, height: 0 })).toBe(false);
    expect(isPlausibleCardBox({ width: 12, height: 12 })).toBe(false);
  });
});
