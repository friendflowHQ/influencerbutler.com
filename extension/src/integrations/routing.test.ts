import { describe, expect, it } from "vitest";
import { buildAffiliateLink, countryFor, resolveTag } from "./routing";
import { withAffiliateTag, canonicalProductUrl } from "./url";
import { validateTags } from "./adapters/associates";

const noCreds = async () => ({});

describe("countryFor", () => {
  it("maps known marketplaces and defaults to US", () => {
    expect(countryFor("amazon.com")).toBe("US");
    expect(countryFor("amazon.co.uk")).toBe("UK");
    expect(countryFor("amazon.co.jp")).toBe("JP");
    expect(countryFor("amazon.example")).toBe("US");
  });
});

describe("resolveTag", () => {
  it("prefers an explicit tag", () => {
    expect(resolveTag("amazon.com", { US: "mytag-20" }, "handle")).toBe("mytag-20");
  });
  it("falls back to the storefront handle for US only", () => {
    expect(resolveTag("amazon.com", {}, "myhandle")).toBe("myhandle");
    expect(resolveTag("amazon.co.uk", {}, "myhandle")).toBeUndefined();
  });
});

describe("withAffiliateTag", () => {
  it("adds and replaces the tag query param", () => {
    expect(withAffiliateTag("https://www.amazon.com/dp/B01", "t-20")).toBe(
      "https://www.amazon.com/dp/B01?tag=t-20",
    );
    expect(withAffiliateTag("https://www.amazon.com/dp/B01?tag=old-20", "new-21")).toBe(
      "https://www.amazon.com/dp/B01?tag=new-21",
    );
  });
});

describe("canonicalProductUrl", () => {
  it("builds a /dp/ url from an ASIN", () => {
    expect(canonicalProductUrl("B0ABC12345", "amazon.com", "")).toBe(
      "https://www.amazon.com/dp/B0ABC12345",
    );
  });
});

describe("buildAffiliateLink", () => {
  const base = { asin: "B0ABC12345", marketplace: "amazon.com" };

  it("returns a plain url when routing is disabled", async () => {
    const url = await buildAffiliateLink(
      base,
      { enabled: false, primaryDeeplinkProvider: null, perCountryTags: { US: "t-20" }, storefrontHandle: null },
      noCreds,
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345");
  });

  it("applies the affiliate tag when enabled with no deeplink provider", async () => {
    const url = await buildAffiliateLink(
      base,
      { enabled: true, primaryDeeplinkProvider: null, perCountryTags: { US: "t-20" }, storefrontHandle: null },
      noCreds,
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345?tag=t-20");
  });

  it("wraps through the primary deeplink provider template", async () => {
    const url = await buildAffiliateLink(
      base,
      { enabled: true, primaryDeeplinkProvider: "selfhosted", perCountryTags: { US: "t-20" }, storefrontHandle: null },
      async () => ({ linkTemplate: "https://go.me/?url={url}" }),
    );
    expect(url).toBe(
      `https://go.me/?url=${encodeURIComponent("https://www.amazon.com/dp/B0ABC12345?tag=t-20")}`,
    );
  });

  it("falls back to the tagged url when the provider throws", async () => {
    const url = await buildAffiliateLink(
      base,
      { enabled: true, primaryDeeplinkProvider: "selfhosted", perCountryTags: { US: "t-20" }, storefrontHandle: null },
      async () => {
        throw new Error("boom");
      },
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345?tag=t-20");
  });
});

describe("validateTags", () => {
  it("accepts well-formed tags and rejects malformed ones", () => {
    expect(validateTags({ US: "mytag-20" }).ok).toBe(true);
    expect(validateTags({}).ok).toBe(false);
    expect(validateTags({ US: "notatag" }).ok).toBe(false);
  });
});
