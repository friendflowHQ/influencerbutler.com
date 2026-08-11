import { describe, expect, it } from "vitest";
import { asinFromDpHref } from "./brand-store";

describe("asinFromDpHref", () => {
  it("reads the ASIN from plain and decorated /dp/ hrefs", () => {
    expect(asinFromDpHref("/dp/B0H3MZ3XMK")).toBe("B0H3MZ3XMK");
    expect(asinFromDpHref("/dp/B0H3MZ3XMK/ref=ast_sto_dp")).toBe("B0H3MZ3XMK");
    expect(asinFromDpHref("/dp/B0H3MZ3XMK?th=1&psc=1")).toBe("B0H3MZ3XMK");
    expect(asinFromDpHref("https://www.amazon.com/Some-Product/dp/B0DNT7XMCL?ref_=x")).toBe(
      "B0DNT7XMCL",
    );
  });

  it("rejects hrefs without a valid ASIN", () => {
    expect(asinFromDpHref(null)).toBeNull();
    expect(asinFromDpHref(undefined)).toBeNull();
    expect(asinFromDpHref("")).toBeNull();
    expect(asinFromDpHref("/stores/Brand/page/1234")).toBeNull();
    // Too short and lowercase are both invalid ASIN shapes.
    expect(asinFromDpHref("/dp/B0H3MZ")).toBeNull();
    expect(asinFromDpHref("/dp/b0h3mz3xmk")).toBeNull();
    // An 11-char run must not match a 10-char prefix of it.
    expect(asinFromDpHref("/dp/B0H3MZ3XMK1")).toBeNull();
  });
});
