import { describe, expect, it } from "vitest";
import { campaignPromptsFor } from "./campaign-prompt";
import { bloomHas, type LoadedFilter } from "../../catalogue/bloom";
import type { CampaignStatusRecord } from "../../shared/messages";

// Bloom fixtures built with the real query-side helpers (catalogue/bloom.ts):
// an all-ones filter answers "present" for every key, an empty one never
// matches, and setFor() builds a filter that matches exactly the given keys
// (by setting the bits bloomHas would probe), so membership is exercised for
// real rather than stubbed. Mirrors campaign-matcher/match.test.ts.

const M = 4096;
function allOnes(): LoadedFilter {
  return { m: M, k: 3, bits: new Uint8Array(M / 8).fill(0xff) };
}
function empty(): LoadedFilter {
  return { m: M, k: 3, bits: new Uint8Array(M / 8) };
}
// A filter containing exactly `keys`: probe the empty filter's bit positions by
// flipping bits until bloomHas agrees. Reproduces the builder's hashing without
// duplicating it: set every bit, then keep only the bits each key needs.
function setFor(keys: string[]): LoadedFilter {
  const filter = empty();
  for (const key of keys) {
    // Find the k positions for this key by brute force against the all-ones
    // reference: flip one bit at a time in a copy until the key stops matching.
    const needed: number[] = [];
    const ref = allOnes();
    for (let bit = 0; bit < M; bit++) {
      const byte = bit >>> 3;
      const mask = 1 << (bit & 7);
      ref.bits[byte]! &= ~mask;
      if (!bloomHas(ref, key)) needed.push(bit);
      ref.bits[byte]! |= mask;
    }
    for (const bit of needed) filter.bits[bit >>> 3]! |= 1 << (bit & 7);
  }
  return filter;
}

const A = "B000TESTAA";
const B = "B000TESTBB";
const C = "B000TESTCC";

function rec(asin: string, cc: boolean, spcc: boolean): CampaignStatusRecord {
  return { asin, cc, spcc, ratePct: null, epc: null, brand: null, acceptedAt: null };
}

describe("campaignPromptsFor", () => {
  it("lists only products with an available campaign", () => {
    const cc = setFor([A]);
    expect(bloomHas(cc, A)).toBe(true);
    expect(bloomHas(cc, B)).toBe(false);
    const out = campaignPromptsFor([A, B, C], { cc, spcc: empty() }, []);
    expect(out).toEqual([{ asin: A, cc: true, spcc: false, ccEnrolled: false, spccEnrolled: false }]);
  });

  it("flags CC and SPCC independently", () => {
    const out = campaignPromptsFor([A, B], { cc: setFor([A]), spcc: setFor([B]) }, []);
    expect(out).toEqual([
      { asin: A, cc: true, spcc: false, ccEnrolled: false, spccEnrolled: false },
      { asin: B, cc: false, spcc: true, ccEnrolled: false, spccEnrolled: false },
    ]);
  });

  it("marks enrollment from the desktop ledger and keeps the program available", () => {
    const out = campaignPromptsFor([A], { cc: allOnes(), spcc: allOnes() }, [rec(A, true, false)]);
    expect(out).toEqual([{ asin: A, cc: true, spcc: true, ccEnrolled: true, spccEnrolled: false }]);
  });

  it("lists an enrolled product even when the filter no longer has it", () => {
    // The Bloom filter is rebuilt daily and a just-ended campaign drops out,
    // but the creator is still enrolled: the Enrolled badge should still show.
    const out = campaignPromptsFor([A], { cc: empty(), spcc: empty() }, [rec(A, false, true)]);
    expect(out).toEqual([{ asin: A, cc: false, spcc: true, ccEnrolled: false, spccEnrolled: true }]);
  });

  it("is silent when no filter is loaded and nothing is enrolled", () => {
    expect(campaignPromptsFor([A, B], {}, [])).toEqual([]);
  });

  it("dedupes, upper-cases, and drops malformed ASINs", () => {
    const out = campaignPromptsFor(
      [A.toLowerCase(), A, "nope", "", "  "],
      { cc: allOnes() },
      [rec(A.toLowerCase(), true, false)],
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.asin).toBe(A);
    expect(out[0]?.ccEnrolled).toBe(true);
  });

  it("preserves the tagged order", () => {
    const out = campaignPromptsFor([C, A, B], { cc: allOnes() }, []);
    expect(out.map((p) => p.asin)).toEqual([C, A, B]);
  });
});
