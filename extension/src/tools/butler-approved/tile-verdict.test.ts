import { describe, expect, it } from "vitest";
import { evaluateTileVerdict, type TileVerdictInputs } from "./tile-verdict";

const APPROVED = { minBoughtPerMonth: 50, maxInfluencerVideos: 5, minPrice: 20 };

function inputs(overrides: Partial<TileVerdictInputs> = {}): TileVerdictInputs {
  // A tile that passes everything with an exact influencer count.
  return {
    priceCents: 2999,
    boughtPastMonth: 500,
    inStock: true,
    influencerVideos: 2,
    totalVideos: 10,
    anyCarousel: true,
    ...overrides,
  };
}

describe("evaluateTileVerdict", () => {
  it("approves when all four criteria pass with an exact count", () => {
    const verdict = evaluateTileVerdict(inputs(), APPROVED);
    expect(verdict.state).toBe("approved");
    expect(verdict.openSlot).toBe("pass");
  });

  it("fails openSlot on an exact count over the limit", () => {
    const verdict = evaluateTileVerdict(inputs({ influencerVideos: 9 }), APPROVED);
    expect(verdict.state).toBe("no");
    expect(verdict.openSlot).toBe("fail");
  });

  it("proves openSlot from a small total video count", () => {
    const verdict = evaluateTileVerdict(
      inputs({ influencerVideos: null, totalVideos: 3 }),
      APPROVED,
    );
    expect(verdict.state).toBe("approved");
    expect(verdict.openSlot).toBe("pass");
  });

  it("stays 'likely' when the total exceeds the limit without a split", () => {
    const verdict = evaluateTileVerdict(
      inputs({ influencerVideos: null, totalVideos: 18 }),
      APPROVED,
    );
    expect(verdict.state).toBe("likely");
    expect(verdict.openSlot).toBe("unknown");
  });

  it("infers zero influencer videos from an empty page", () => {
    const verdict = evaluateTileVerdict(
      inputs({ influencerVideos: null, totalVideos: null, anyCarousel: false }),
      APPROVED,
    );
    expect(verdict.state).toBe("approved");
    expect(verdict.openSlot).toBe("pass");
  });

  it("prefers the exact count over the total bound", () => {
    const verdict = evaluateTileVerdict(
      inputs({ influencerVideos: 7, totalVideos: 3 }),
      APPROVED,
    );
    expect(verdict.openSlot).toBe("fail");
    expect(verdict.state).toBe("no");
  });

  it("rejects below the price floor", () => {
    const verdict = evaluateTileVerdict(inputs({ priceCents: 1200 }), APPROVED);
    expect(verdict.state).toBe("no");
    expect(verdict.priceFloor).toBe("fail");
  });

  it("rejects slow sellers", () => {
    const verdict = evaluateTileVerdict(inputs({ boughtPastMonth: 10 }), APPROVED);
    expect(verdict.state).toBe("no");
    expect(verdict.activelySelling).toBe("fail");
  });

  it("stays unknown before enrichment fills stock state", () => {
    const verdict = evaluateTileVerdict(
      inputs({ inStock: null, influencerVideos: null, totalVideos: null, anyCarousel: null }),
      APPROVED,
    );
    expect(verdict.state).toBe("unknown");
  });

  it("out-of-stock fails even when everything else passes", () => {
    const verdict = evaluateTileVerdict(inputs({ inStock: false }), APPROVED);
    expect(verdict.state).toBe("no");
    expect(verdict.inStock).toBe("fail");
  });
});
