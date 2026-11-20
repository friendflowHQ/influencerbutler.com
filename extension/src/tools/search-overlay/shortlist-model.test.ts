import { describe, expect, it } from "vitest";
import { deserializeItems, serializeItems, SHORTLIST_MAX, toggleItem, toProductRefs, type ShortlistItem } from "./shortlist-model";

const item = (asin: string, marketplace = "amazon.com"): ShortlistItem => ({
  asin,
  marketplace,
  title: `Title ${asin}`,
  imageUrl: null,
  priceCents: 1999,
  currency: "USD",
  href: `https://example.com/${asin}`,
});

describe("shortlist model", () => {
  it("adds, then removes on a second toggle", () => {
    const a = toggleItem([], item("A1"));
    expect(a).toMatchObject({ added: true, full: false });
    expect(a.items).toHaveLength(1);
    const b = toggleItem(a.items, item("A1"));
    expect(b).toMatchObject({ added: false, full: false });
    expect(b.items).toHaveLength(0);
  });

  it("treats the same ASIN on another marketplace as a different product", () => {
    const a = toggleItem([item("A1")], item("A1", "amazon.ca"));
    expect(a.items).toHaveLength(2);
  });

  it("refuses to grow past the cap, but still allows removal", () => {
    let items: ShortlistItem[] = [];
    for (let i = 0; i < SHORTLIST_MAX; i += 1) items = toggleItem(items, item(`P${i}`)).items;
    const over = toggleItem(items, item("EXTRA"));
    expect(over).toMatchObject({ added: false, full: true });
    expect(over.items).toHaveLength(SHORTLIST_MAX);
    expect(toggleItem(items, item("P0")).items).toHaveLength(SHORTLIST_MAX - 1);
  });

  it("builds product refs for the bridge", () => {
    const [ref] = toProductRefs([item("A1")]);
    expect(ref).toMatchObject({ asin: "A1", marketplace: "amazon.com", priceCents: 1999, currency: "USD", url: "https://example.com/A1" });
  });

  it("round-trips through storage and survives junk", () => {
    const items = [item("A1"), item("A2")];
    expect(deserializeItems(serializeItems(items))).toEqual(items.map((i) => ({ ...i, retailer: undefined })));
    expect(deserializeItems("not json")).toEqual([]);
    expect(deserializeItems(JSON.stringify([{ asin: 5 }, null, "x"]))).toEqual([]);
    expect(deserializeItems(null)).toEqual([]);
  });
});
