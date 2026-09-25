import { describe, expect, it } from "vitest";
import { buildIndex, matchRec, normalizeTitle, type BenableRec } from "./model";

// The card DOM (Svelte-hashed classes on benable.com list pages) needs a live
// browser, so per the repo convention the card walk is covered by the live smoke
// test; these tests exercise the pure title normalization + card->rec join that
// carries the real logic.

const recs: BenableRec[] = [
  { asin: "B01D1XVQ64", id: "20785638", title: "GUSTO Clear Plastic Cups with Flat Lids 16oz", photoIds: ["68471232", "68471233"] },
  { asin: "B0G25HHLFL", id: "20785663", title: "Lemonade Stand Supplies Kids Apron & Decor", photoIds: ["68471878"] },
  { asin: "B0AMAZON123", id: "20785698", title: "Lemonade Apron - Amazon.com", photoIds: [] },
];

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeTitle("GUSTO Clear Plastic Cups with Flat Lids 16oz")).toBe(
      "gusto clear plastic cups with flat lids 16oz",
    );
    expect(normalizeTitle("Lemonade Apron - Amazon.com")).toBe("lemonade apron amazon com");
    expect(normalizeTitle(null)).toBe("");
  });
});

describe("matchRec", () => {
  const index = buildIndex(recs);

  it("joins by rec_object id first, before any image or text", () => {
    // The card carries data-rec-object-id up front even when its image has not
    // lazy-loaded (photoId null) and its text is empty or misleading.
    expect(matchRec(index, { recObjectId: "20785663", photoId: null, text: "" })?.asin).toBe(
      "B0G25HHLFL",
    );
    expect(
      matchRec(index, { recObjectId: "20785638", photoId: "68471878", text: "wrong title" })?.asin,
    ).toBe("B01D1XVQ64");
  });

  it("joins by photo id when there is no rec_object id", () => {
    expect(matchRec(index, { photoId: "68471233", text: "anything" })?.asin).toBe("B01D1XVQ64");
    expect(matchRec(index, { photoId: "68471878", text: "" })?.asin).toBe("B0G25HHLFL");
  });

  it("falls back to an exact normalized title match", () => {
    expect(
      matchRec(index, { photoId: "999999", text: "GUSTO Clear Plastic Cups with Flat Lids 16oz" })?.asin,
    ).toBe("B01D1XVQ64");
  });

  it("falls back to the longest rec title contained in the card text", () => {
    // A card whose photo id is not in any rec (the generic "- Amazon.com" case),
    // matched by the rec title appearing inside the card's fuller text.
    const card = { photoId: "68473990", text: "A cute Lemonade Apron - Amazon.com pick for kids" };
    expect(matchRec(index, card)?.asin).toBe("B0AMAZON123");
  });

  it("returns null when nothing matches", () => {
    expect(matchRec(index, { photoId: "000", text: "unrelated widget" })).toBeNull();
    expect(matchRec(buildIndex([]), { photoId: "68471232", text: "x" })).toBeNull();
  });

  it("does not match on a too-short title coincidence", () => {
    const shortIndex = buildIndex([{ asin: "B00SHORT001", id: null, title: "Cup", photoIds: [] }]);
    expect(matchRec(shortIndex, { photoId: null, text: "a cup of tea" })).toBeNull();
  });
});
