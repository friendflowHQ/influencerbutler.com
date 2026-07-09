import { describe, expect, it } from "vitest";
import { recordPricePoint } from "./price-history";
import { PRICE_HISTORY_ASINS_CAP, PRICE_HISTORY_POINTS_CAP } from "../storage/schema";

const KEY = "amazon.com:B0AAAAAAAA";
const HOUR = 60 * 60 * 1000;

describe("recordPricePoint", () => {
  it("records the first price for a product", () => {
    const out = recordPricePoint({}, KEY, 1999, 1000);
    expect(out[KEY]).toEqual([{ at: 1000, cents: 1999 }]);
  });

  it("ignores a non-positive or non-finite price", () => {
    expect(recordPricePoint({}, KEY, 0, 1000)).toEqual({});
    expect(recordPricePoint({}, KEY, -5, 1000)).toEqual({});
    expect(recordPricePoint({}, KEY, NaN, 1000)).toEqual({});
  });

  it("skips a redundant same-price sample inside the window", () => {
    const first = recordPricePoint({}, KEY, 1999, 1000);
    const second = recordPricePoint(first, KEY, 1999, 1000 + 2 * HOUR);
    expect(second).toBe(first); // unchanged reference: nothing recorded
    expect(second[KEY]).toHaveLength(1);
  });

  it("records a same price again once the window has passed", () => {
    const first = recordPricePoint({}, KEY, 1999, 1000);
    const later = recordPricePoint(first, KEY, 1999, 1000 + 13 * HOUR);
    expect(later[KEY]).toHaveLength(2);
  });

  it("records a price change immediately, even inside the window", () => {
    const first = recordPricePoint({}, KEY, 1999, 1000);
    const dropped = recordPricePoint(first, KEY, 1499, 1000 + HOUR);
    expect(dropped[KEY]).toEqual([
      { at: 1000, cents: 1999 },
      { at: 1000 + HOUR, cents: 1499 },
    ]);
  });

  it("does not mutate the input history", () => {
    const input = { [KEY]: [{ at: 1000, cents: 1999 }] };
    const snapshot = JSON.stringify(input);
    recordPricePoint(input, KEY, 1499, 1000 + HOUR);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("caps points per product, dropping the oldest", () => {
    let history: Record<string, { at: number; cents: number }[]> = {};
    for (let i = 0; i < PRICE_HISTORY_POINTS_CAP + 10; i += 1) {
      // Alternate the price so every sample records (a change each step).
      history = recordPricePoint(history, KEY, 1000 + (i % 2), i * 100_000_000);
    }
    expect(history[KEY]).toHaveLength(PRICE_HISTORY_POINTS_CAP);
  });

  it("caps the number of tracked products, dropping least-recently-seen", () => {
    let history: Record<string, { at: number; cents: number }[]> = {};
    for (let i = 0; i < PRICE_HISTORY_ASINS_CAP + 5; i += 1) {
      history = recordPricePoint(history, `amazon.com:ASIN${i}`, 1000, i * 100_000_000);
    }
    expect(Object.keys(history)).toHaveLength(PRICE_HISTORY_ASINS_CAP);
    // The earliest-seen products are the ones dropped.
    expect(history["amazon.com:ASIN0"]).toBeUndefined();
    expect(history[`amazon.com:ASIN${PRICE_HISTORY_ASINS_CAP + 4}`]).toBeDefined();
  });
});
