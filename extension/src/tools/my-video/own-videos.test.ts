import { describe, expect, it } from "vitest";
import { mergeRecords, normalizeOwnId, pruneRecords, type OwnVideoRecord } from "./own-videos";

const HEX = "0f9cd8101111111111111111111111aa";

function rec(over: Partial<OwnVideoRecord> = {}): OwnVideoRecord {
  return {
    contentId: HEX,
    title: "Mine",
    asins: [],
    marketplace: null,
    source: "creator-manage",
    seenAt: 0,
    ...over,
  };
}

describe("normalizeOwnId", () => {
  it("accepts every spelling a video id arrives in", () => {
    expect(normalizeOwnId(`amzn1.vse.video.${HEX}`)).toBe(HEX);
    expect(normalizeOwnId(`amzn1.vse.video.${HEX.toUpperCase()}`)).toBe(HEX);
    expect(normalizeOwnId(HEX.toUpperCase())).toBe(HEX);
    expect(normalizeOwnId(`https://www.amazon.com/vdp/${HEX}`)).toBe(HEX);
    expect(normalizeOwnId(`/vdp/${HEX}?ref=foo`)).toBe(HEX);
    expect(normalizeOwnId(`https://www.amazon.com/x?vdp=${HEX}`)).toBe(HEX);
  });

  it("rejects junk rather than inventing an id", () => {
    expect(normalizeOwnId(null)).toBeNull();
    expect(normalizeOwnId("")).toBeNull();
    expect(normalizeOwnId("   ")).toBeNull();
    expect(normalizeOwnId("not an id")).toBeNull();
    expect(normalizeOwnId("/shop/lizdean")).toBeNull();
    expect(normalizeOwnId("abc123")).toBeNull(); // too short to be a video id
  });
});

describe("mergeRecords", () => {
  it("keeps a known title when the new sighting has none", () => {
    const merged = mergeRecords(rec({ title: "Real title" }), rec({ title: null }), 100);
    expect(merged.title).toBe("Real title");
    expect(merged.seenAt).toBe(100);
  });

  // A manage-list row carries no ASINs, and must not blank the ASINs the
  // edit-post page gave us.
  it("unions asins instead of replacing them", () => {
    const merged = mergeRecords(
      rec({ asins: ["B000000001"] }),
      rec({ asins: ["B000000002"], source: "manage-content" }),
      1,
    );
    expect(merged.asins.sort()).toEqual(["B000000001", "B000000002"]);
    expect(merged.source).toBe("manage-content");
  });

  it("keeps a known marketplace when the new sighting has none", () => {
    const merged = mergeRecords(rec({ marketplace: "US" }), rec({ marketplace: null }), 1);
    expect(merged.marketplace).toBe("US");
  });

  it("takes the incoming record wholesale when there is nothing to merge with", () => {
    const merged = mergeRecords(undefined, rec({ title: "New" }), 42);
    expect(merged.title).toBe("New");
    expect(merged.seenAt).toBe(42);
  });
});

describe("pruneRecords", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = 400 * DAY;

  it("drops expired entries first", () => {
    const map = {
      fresh: rec({ contentId: "fresh", seenAt: now - DAY }),
      stale: rec({ contentId: "stale", seenAt: now - 200 * DAY }),
    };
    const out = pruneRecords(map, now, 10);
    expect(Object.keys(out)).toEqual(["fresh"]);
  });

  it("drops oldest-first once the cap is still exceeded", () => {
    const map: Record<string, OwnVideoRecord> = {};
    for (let i = 0; i < 5; i += 1) {
      map[`id${i}`] = rec({ contentId: `id${i}`, seenAt: now - i * 1000 });
    }
    const out = pruneRecords(map, now, 3);
    expect(Object.keys(out).sort()).toEqual(["id0", "id1", "id2"]);
  });

  it("leaves a map that fits under the cap alone", () => {
    const map = { a: rec({ contentId: "a", seenAt: now }) };
    expect(Object.keys(pruneRecords(map, now, 10))).toEqual(["a"]);
  });
});
