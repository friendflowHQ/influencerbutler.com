import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EnrichedProduct } from "../shared/messages";

// row-enrich merges three sources (bloom membership, CC rates, Creator API
// image/title). Stub each so the test drives the merge and the write-back, not
// the network or storage.
vi.mock("../catalogue/cache", () => ({
  getCache: vi.fn(async () => ({})),
  loadFilters: vi.fn(() => ({})),
  membership: vi.fn(),
}));
vi.mock("./cc-rates", () => ({ lookupCcRates: vi.fn() }));
vi.mock("./enrich", () => ({ enrichProducts: vi.fn() }));
vi.mock("./watchlist", () => ({ backfillWatchItem: vi.fn() }));
vi.mock("./product-lists", () => ({ backfillProductListItem: vi.fn() }));

import { enrichRows } from "./row-enrich";
import { membership } from "../catalogue/cache";
import { lookupCcRates } from "./cc-rates";
import { enrichProducts } from "./enrich";
import { backfillWatchItem } from "./watchlist";
import { backfillProductListItem } from "./product-lists";

const membershipMock = vi.mocked(membership);
const lookupCcRatesMock = vi.mocked(lookupCcRates);
const enrichProductsMock = vi.mocked(enrichProducts);
const backfillWatchItemMock = vi.mocked(backfillWatchItem);
const backfillProductListItemMock = vi.mocked(backfillProductListItem);

function product(over: Partial<EnrichedProduct>): EnrichedProduct {
  return {
    asin: over.asin ?? null,
    marketplace: over.marketplace ?? "amazon.com",
    found: over.found ?? true,
    title: over.title ?? null,
    brand: null,
    priceDisplay: null,
    priceCents: null,
    currency: null,
    availability: null,
    primeEligible: null,
    binding: null,
    browseNode: null,
    imageUrl: over.imageUrl ?? null,
    detailPageUrl: null,
    error: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  membershipMock.mockReturnValue({ cc: false, spcc: false, deals: false });
  lookupCcRatesMock.mockResolvedValue({ ok: true, rates: {} });
  enrichProductsMock.mockResolvedValue({ ok: true, configured: true, items: [] });
});

describe("enrichRows", () => {
  it("gives a CC member its commission rate and leaves a non-member bare", async () => {
    membershipMock.mockImplementation((_loaded, asin) =>
      asin === "AAAAAAAAAA"
        ? { cc: true, spcc: false, deals: false }
        : { cc: false, spcc: false, deals: false },
    );
    lookupCcRatesMock.mockResolvedValue({
      ok: true,
      rates: { AAAAAAAAAA: { ratePct: 12, brand: null, endsAt: null } },
    });

    const { badges } = await enrichRows([
      { asin: "AAAAAAAAAA", marketplace: "amazon.com", source: "list", listId: "l1", needsImage: false },
      { asin: "BBBBBBBBBB", marketplace: "amazon.com", source: "list", listId: "l1", needsImage: false },
    ]);

    expect(badges.AAAAAAAAAA).toMatchObject({ cc: true, ratePct: 12 });
    expect(badges.BBBBBBBBBB).toMatchObject({ cc: false, ratePct: null });
    // Only the CC member is looked up; a miss is never asked for.
    expect(lookupCcRatesMock).toHaveBeenCalledWith(["AAAAAAAAAA"]);
    // No row needed an image, so the Creator API is never hit.
    expect(enrichProductsMock).not.toHaveBeenCalled();
  });

  it("keeps chips when the Creator API is not configured (image stays null)", async () => {
    membershipMock.mockImplementation((_loaded, asin) => ({
      cc: false,
      spcc: asin === "CCCCCCCCCC",
      deals: false,
    }));
    enrichProductsMock.mockResolvedValue({ ok: false, configured: false, items: [] });

    const { badges } = await enrichRows([
      { asin: "CCCCCCCCCC", marketplace: "amazon.com", source: "watchlist", needsImage: true },
    ]);

    expect(badges.CCCCCCCCCC).toMatchObject({ spcc: true, imageUrl: null, title: null });
    // Nothing fetched, so nothing is written back.
    expect(backfillWatchItemMock).not.toHaveBeenCalled();
  });

  it("fetches image/title for rows that need it and writes them back", async () => {
    enrichProductsMock.mockResolvedValue({
      ok: true,
      configured: true,
      items: [
        {
          asin: "DDDDDDDDDD",
          results: [
            product({ asin: "DDDDDDDDDD", title: "Swim trunks", imageUrl: "https://img/x.jpg" }),
          ],
        },
      ],
    });

    const { badges } = await enrichRows([
      { asin: "DDDDDDDDDD", marketplace: "amazon.com", source: "list", listId: "l9", needsImage: true },
    ]);

    expect(badges.DDDDDDDDDD).toMatchObject({
      imageUrl: "https://img/x.jpg",
      title: "Swim trunks",
    });
    // The request is scoped to the row's own marketplace so it returns one row.
    expect(enrichProductsMock).toHaveBeenCalledWith(["DDDDDDDDDD"], ["amazon.com"]);
    expect(backfillProductListItemMock).toHaveBeenCalledWith("l9", "DDDDDDDDDD", "amazon.com", {
      imageUrl: "https://img/x.jpg",
      title: "Swim trunks",
    });
  });

  it("skips invalid ASINs entirely", async () => {
    const { badges } = await enrichRows([
      { asin: "not-an-asin", marketplace: "amazon.com", source: "list", listId: "l1", needsImage: true },
    ]);
    expect(badges).toEqual({});
    expect(enrichProductsMock).not.toHaveBeenCalled();
  });
});
