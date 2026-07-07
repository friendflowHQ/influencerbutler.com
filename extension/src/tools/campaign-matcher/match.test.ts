import { describe, expect, it } from "vitest";
import { matchCampaigns } from "./match";
import type { LoadedFilter } from "../../catalogue/bloom";

// A filter whose bits are all set answers "present" for every key, so we can
// exercise the matcher's dedup / kind-preference logic without a real corpus.
function allOnes(): LoadedFilter {
  const m = 1024;
  return { m, k: 3, bits: new Uint8Array(m / 8).fill(0xff) };
}
// A filter with no bits set never matches.
function empty(): LoadedFilter {
  const m = 1024;
  return { m, k: 3, bits: new Uint8Array(m / 8) };
}

describe("matchCampaigns", () => {
  it("prefers CC over SPCC when a product is in both", () => {
    const matches = matchCampaigns([{ asin: "B000TEST01", title: "T" }], {
      cc: allOnes(),
      spcc: allOnes(),
    });
    expect(matches).toEqual([{ asin: "B000TEST01", kind: "cc", title: "T" }]);
  });

  it("falls back to SPCC when only SPCC matches", () => {
    const matches = matchCampaigns([{ asin: "B000TEST01", title: null }], {
      cc: empty(),
      spcc: allOnes(),
    });
    expect(matches[0]?.kind).toBe("spcc");
  });

  it("dedupes repeated ASINs and skips malformed ones", () => {
    const matches = matchCampaigns(
      [
        { asin: "b000test01", title: "lower" },
        { asin: "B000TEST01", title: "dupe" },
        { asin: "nope", title: "bad" },
      ],
      { cc: allOnes() },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]?.asin).toBe("B000TEST01");
  });

  it("returns nothing when no filter matches", () => {
    expect(matchCampaigns([{ asin: "B000TEST01", title: null }], { cc: empty() })).toEqual([]);
  });
});
