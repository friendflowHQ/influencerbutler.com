import { describe, expect, it } from "vitest";
import { triggered } from "./watchlist";
import type { WatchCondition, WatchSnapshot } from "../storage/schema";
import type { ProductSnapshotResult } from "../shared/messages";

const ALL: WatchCondition[] = ["back_in_stock", "slot_opens", "price_drop"];

function last(over: Partial<WatchSnapshot>): WatchSnapshot {
  return { inStock: true, influencerVideos: 5, priceCents: 5000, checkedAt: 0, ...over };
}
function now(over: Partial<ProductSnapshotResult>): ProductSnapshotResult {
  return { inStock: true, influencerVideos: 5, priceCents: 5000, ...over };
}

describe("triggered", () => {
  it("fires back_in_stock only on a false -> true transition", () => {
    expect(triggered(last({ inStock: false }), now({ inStock: true }), ALL)).toContain("back_in_stock");
    expect(triggered(last({ inStock: true }), now({ inStock: true }), ALL)).not.toContain(
      "back_in_stock",
    );
  });

  it("fires slot_opens when the influencer video count drops", () => {
    expect(triggered(last({ influencerVideos: 6 }), now({ influencerVideos: 4 }), ALL)).toContain(
      "slot_opens",
    );
    expect(triggered(last({ influencerVideos: 4 }), now({ influencerVideos: 6 }), ALL)).not.toContain(
      "slot_opens",
    );
  });

  it("fires price_drop only when the price falls", () => {
    expect(triggered(last({ priceCents: 5000 }), now({ priceCents: 4000 }), ALL)).toContain(
      "price_drop",
    );
    expect(triggered(last({ priceCents: 5000 }), now({ priceCents: 6000 }), ALL)).not.toContain(
      "price_drop",
    );
  });

  it("respects the notifyOn subscription", () => {
    const fired = triggered(last({ inStock: false, priceCents: 5000 }), now({ inStock: true, priceCents: 4000 }), [
      "price_drop",
    ]);
    expect(fired).toEqual(["price_drop"]);
  });

  it("never fires on a null (unknown) prior reading", () => {
    expect(triggered(last({ inStock: null, influencerVideos: null, priceCents: null }), now({}), ALL)).toEqual(
      [],
    );
  });
});
