import { describe, expect, it } from "vitest";
import {
  STOREFRONT_INDEX_CAP,
  buildStorefrontIndex,
  matchedAsinSet,
  readStorefrontIndex,
} from "./index-store";

const video = (url: string, asins: string[], title = "t") => ({
  type: "video",
  title,
  url,
  taggedAsins: asins,
});

describe("buildStorefrontIndex", () => {
  it("maps each tagged ASIN to the newest own video that tags it", () => {
    const idx = buildStorefrontIndex(
      [
        video("https://www.amazon.com/live/video/new", ["B000000001"]),
        video("https://www.amazon.com/live/video/old", ["B000000001", "B000000002"]),
      ],
      1000,
      "me",
    );
    expect(idx.byAsin.B000000001?.url).toBe("https://www.amazon.com/live/video/new");
    expect(idx.byAsin.B000000002?.url).toBe("https://www.amazon.com/live/video/old");
    expect(idx.handle).toBe("me");
    expect(idx.updatedAt).toBe(1000);
  });

  it("keeps videos only, on Amazon https hosts only", () => {
    const idx = buildStorefrontIndex(
      [
        { type: "photo", title: "p", url: "https://www.amazon.com/p/1", taggedAsins: ["B000000001"] },
        video("https://evil.example.com/x", ["B000000002"]),
        video("http://www.amazon.com/insecure", ["B000000003"]),
        video("https://www.amazon.co.uk/video/1", ["B000000004"]),
        video("not a url", ["B000000005"]),
      ],
      1,
      null,
    );
    expect(Object.keys(idx.byAsin)).toEqual(["B000000004"]);
  });

  it("ignores malformed ASINs and normalizes case", () => {
    const idx = buildStorefrontIndex(
      [video("https://www.amazon.com/v/1", ["b000000001", "short", " B000000002 "])],
      1,
      null,
    );
    expect(Object.keys(idx.byAsin).sort()).toEqual(["B000000001", "B000000002"]);
  });

  it("caps the index size", () => {
    const asins = Array.from({ length: STOREFRONT_INDEX_CAP + 50 }, (_, i) =>
      `B${String(i).padStart(9, "0")}`,
    );
    const idx = buildStorefrontIndex([video("https://www.amazon.com/v/1", asins)], 1, null);
    expect(Object.keys(idx.byAsin)).toHaveLength(STOREFRONT_INDEX_CAP);
  });
});

describe("readStorefrontIndex", () => {
  it("rejects junk and drops bad entries", () => {
    expect(readStorefrontIndex(null)).toBeNull();
    expect(readStorefrontIndex({ updatedAt: "x" })).toBeNull();
    const out = readStorefrontIndex({
      updatedAt: 5,
      handle: "me",
      byAsin: {
        B000000001: { url: "https://www.amazon.com/v/1", title: "ok" },
        B000000002: { url: "https://evil.example.com/v", title: "bad host" },
        bad: { url: "https://www.amazon.com/v/2", title: "bad asin" },
      },
    });
    expect(Object.keys(out?.byAsin ?? {})).toEqual(["B000000001"]);
  });
});

describe("matchedAsinSet", () => {
  it("unions the storefront and order ASINs", () => {
    const idx = buildStorefrontIndex([video("https://www.amazon.com/v/1", ["B000000001"])], 1, "me");
    const set = matchedAsinSet(idx, ["b000000002", "junk"]);
    expect([...set].sort()).toEqual(["B000000001", "B000000002"]);
    expect(matchedAsinSet(null, []).size).toBe(0);
  });
});
