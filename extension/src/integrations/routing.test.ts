import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAffiliateLink, countryFor, resolveTag } from "./routing";
import { withAffiliateTag, canonicalProductUrl } from "./url";
import { validateTags } from "./adapters/associates";

const noCreds = async () => ({});

afterEach(() => vi.unstubAllGlobals());

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
  // The Creator API partner tag (including Influencer Butler's backup tag
  // littleprettyl-20) is only ever passed to resolveTag as a product-data value
  // if a bug wired it in. resolveTag reads only perCountryTags / storefrontHandle,
  // so with no user tag of their own the link stays untagged: the product-data
  // tag can never leak into a shared link.
  it("never uses a Creator API partner tag as the link tag", () => {
    // No user tag anywhere. Even though "littleprettyl-20" is the account's
    // Creator API partner tag, resolveTag has no channel for it and returns
    // undefined, so buildAffiliateLink below leaves the link untagged.
    expect(resolveTag("amazon.com", {}, null)).toBeUndefined();
    expect(resolveTag("amazon.com", {}, "")).toBeUndefined();
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
    const { url } = await buildAffiliateLink(
      base,
      { enabled: false, primaryDeeplinkProvider: null, perCountryTags: { US: "t-20" }, storefrontHandle: null },
      noCreds,
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345");
  });

  it("applies the affiliate tag when enabled with no deeplink provider", async () => {
    const { url } = await buildAffiliateLink(
      base,
      { enabled: true, primaryDeeplinkProvider: null, perCountryTags: { US: "t-20" }, storefrontHandle: null },
      noCreds,
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345?tag=t-20");
  });

  // Guard: the Creator API / backup partner tag (littleprettyl-20) must never
  // end up on a link the user shares. With routing enabled but no user affiliate
  // tag configured, the built link carries NO tag at all, and in particular not
  // littleprettyl-20 (which lives in a separate product-data credential store the
  // link builder cannot see).
  it("never stamps the Creator API partner tag on a shared link", async () => {
    const { url } = await buildAffiliateLink(
      base,
      { enabled: true, primaryDeeplinkProvider: null, perCountryTags: {}, storefrontHandle: null },
      noCreds,
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345");
    expect(url).not.toContain("littleprettyl-20");
    expect(url).not.toContain("tag=");
  });

  it("wraps through the primary deeplink provider template", async () => {
    const { url } = await buildAffiliateLink(
      base,
      { enabled: true, primaryDeeplinkProvider: "selfhosted", perCountryTags: { US: "t-20" }, storefrontHandle: null },
      async () => ({ linkTemplate: "https://go.me/?url={url}" }),
    );
    expect(url).toBe(
      `https://go.me/?url=${encodeURIComponent("https://www.amazon.com/dp/B0ABC12345?tag=t-20")}`,
    );
  });

  it("falls back to the tagged url when the provider throws", async () => {
    const { url, notice } = await buildAffiliateLink(
      base,
      { enabled: true, primaryDeeplinkProvider: "selfhosted", perCountryTags: { US: "t-20" }, storefrontHandle: null },
      async () => {
        throw new Error("boom");
      },
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345?tag=t-20");
    expect(notice).toBeUndefined();
  });

  // Branded links with no license key: still a working tagged url, but the
  // caller gets a reason so the UI can explain the fallback (the original bug
  // was that this was silent).
  it("reports signInRequired when branded links have no license key", async () => {
    const { url, notice } = await buildAffiliateLink(
      base,
      {
        enabled: true,
        primaryDeeplinkProvider: "influencerbutler",
        perCountryTags: { US: "t-20" },
        storefrontHandle: null,
      },
      noCreds,
    );
    expect(url).toBe("https://www.amazon.com/dp/B0ABC12345?tag=t-20");
    expect(notice).toBe("signInRequired");
  });

  it("prefers a participating affiliate network's minted link over the deeplink wrapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ link: "https://levanta.pxf.io/abc" }), { status: 200 })),
    );
    const { url } = await buildAffiliateLink(
      base,
      {
        enabled: true,
        primaryDeeplinkProvider: "selfhosted",
        affiliateNetworks: ["levanta"],
        perCountryTags: { US: "t-20" },
        storefrontHandle: null,
      },
      async (id): Promise<Record<string, string>> =>
        id === "levanta" ? { apiKey: "k" } : { linkTemplate: "https://go.me/?url={url}" },
    );
    expect(url).toBe("https://levanta.pxf.io/abc");
  });

  it("falls back to the deeplink wrapper when the network mint fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    const { url } = await buildAffiliateLink(
      base,
      {
        enabled: true,
        primaryDeeplinkProvider: "selfhosted",
        affiliateNetworks: ["levanta"],
        perCountryTags: { US: "t-20" },
        storefrontHandle: null,
      },
      async (id): Promise<Record<string, string>> =>
        id === "levanta" ? { apiKey: "k" } : { linkTemplate: "https://go.me/?url={url}" },
    );
    expect(url).toBe(
      `https://go.me/?url=${encodeURIComponent("https://www.amazon.com/dp/B0ABC12345?tag=t-20")}`,
    );
  });
});

describe("validateTags", () => {
  it("accepts well-formed tags and rejects malformed ones", () => {
    expect(validateTags({ US: "mytag-20" }).ok).toBe(true);
    expect(validateTags({}).ok).toBe(false);
    expect(validateTags({ US: "notatag" }).ok).toBe(false);
  });
});
