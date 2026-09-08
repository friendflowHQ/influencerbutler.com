import { describe, expect, it } from "vitest";
import { PROTECTED_ATTRIBUTION_KEYS, withAppOpenParams } from "./app-link";

const ASIN = "B0ABC12345";

describe("withAppOpenParams", () => {
  it("adds linkCode=ssc and creativeASIN to a /dp/ url", () => {
    const out = withAppOpenParams(`https://www.amazon.com/dp/${ASIN}?tag=t-20`, ASIN);
    const u = new URL(out);
    expect(u.searchParams.get("tag")).toBe("t-20");
    expect(u.searchParams.get("linkCode")).toBe("ssc");
    expect(u.searchParams.get("creativeASIN")).toBe(ASIN);
  });

  it("handles /gp/product/ paths and non-US marketplaces", () => {
    const out = withAppOpenParams(`https://www.amazon.co.uk/gp/product/${ASIN}`, ASIN);
    expect(out).toBe(`https://www.amazon.co.uk/gp/product/${ASIN}?linkCode=ssc&creativeASIN=${ASIN}`);
  });

  it("is idempotent: a second pass leaves the url unchanged", () => {
    const once = withAppOpenParams(`https://www.amazon.com/dp/${ASIN}?tag=t-20`, ASIN);
    expect(withAppOpenParams(once, ASIN)).toBe(once);
  });

  it.each(PROTECTED_ATTRIBUTION_KEYS)("leaves a url alone when %s is already present", (key) => {
    const url = `https://www.amazon.com/dp/${ASIN}?tag=t-20&${key}=x`;
    expect(withAppOpenParams(url, ASIN)).toBe(url);
  });

  it("compares protected keys case-insensitively", () => {
    const url = `https://www.amazon.com/dp/${ASIN}?CREATIVEASIN=${ASIN}`;
    expect(withAppOpenParams(url, ASIN)).toBe(url);
    const url2 = `https://www.amazon.com/dp/${ASIN}?ASCSUBTAG=abc`;
    expect(withAppOpenParams(url2, ASIN)).toBe(url2);
  });

  it("never overwrites an existing linkCode", () => {
    const out = withAppOpenParams(`https://www.amazon.com/dp/${ASIN}?linkCode=ll1`, ASIN);
    const u = new URL(out);
    expect(u.searchParams.get("linkCode")).toBe("ll1");
    expect(u.searchParams.get("creativeASIN")).toBe(ASIN);
    // Case-insensitive on the key too.
    const out2 = withAppOpenParams(`https://www.amazon.com/dp/${ASIN}?linkcode=ll1`, ASIN);
    expect(new URL(out2).searchParams.get("linkcode")).toBe("ll1");
    expect(out2).not.toContain("ssc");
  });

  it("leaves Walmart urls untouched", () => {
    const url = "https://www.walmart.com/ip/123456789";
    expect(withAppOpenParams(url, "123456789")).toBe(url);
  });

  it("leaves non-product Amazon urls untouched", () => {
    const search = "https://www.amazon.com/s?k=air+fryer";
    expect(withAppOpenParams(search, ASIN)).toBe(search);
    const store = "https://www.amazon.com/shop/creator";
    expect(withAppOpenParams(store, ASIN)).toBe(store);
    const short = "https://amzn.to/abc";
    expect(withAppOpenParams(short, ASIN)).toBe(short);
  });

  it("passes a malformed url through unchanged", () => {
    expect(withAppOpenParams("not a url", ASIN)).toBe("not a url");
    expect(withAppOpenParams("", ASIN)).toBe("");
  });

  it("uppercases a lowercase asin", () => {
    const out = withAppOpenParams(`https://www.amazon.com/dp/${ASIN}`, ASIN.toLowerCase());
    expect(new URL(out).searchParams.get("creativeASIN")).toBe(ASIN);
  });

  it("falls back to the ASIN in the path when the argument is not an ASIN", () => {
    const out = withAppOpenParams(`https://www.amazon.com/dp/${ASIN}`, "");
    expect(new URL(out).searchParams.get("creativeASIN")).toBe(ASIN);
  });
});
