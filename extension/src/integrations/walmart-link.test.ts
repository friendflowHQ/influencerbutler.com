import { describe, expect, it } from "vitest";
import { __test } from "./adapters/walmart-link";
import { buildAffiliateLink, type RoutingConfig } from "./routing";
import { canonicalProductUrl } from "./url";

const { buildImpactDeepLink } = __test;

describe("buildImpactDeepLink", () => {
  it("wraps the destination url in an Impact goto.walmart.com link", () => {
    const link = buildImpactDeepLink("https://www.walmart.com/ip/10450114", {
      publisherId: "1234567",
      campaignId: "2003851",
      adId: "9",
    });
    expect(link).toBe(
      "https://goto.walmart.com/c/1234567/2003851/9?u=https%3A%2F%2Fwww.walmart.com%2Fip%2F10450114",
    );
  });

  it("adds subId1 when a subId is given", () => {
    const link = buildImpactDeepLink("https://www.walmart.com/ip/10450114", {
      publisherId: "1",
      campaignId: "2",
      adId: "3",
      subId: "ext",
    });
    expect(link).toContain("subId1=ext");
  });

  it("falls back to the plain destination when ids are missing", () => {
    expect(
      buildImpactDeepLink("https://www.walmart.com/ip/10450114", {
        publisherId: "",
        campaignId: "2",
        adId: "3",
      }),
    ).toBe("https://www.walmart.com/ip/10450114");
  });
});

describe("canonicalProductUrl (Walmart)", () => {
  it("builds a /ip/ url for Walmart and /dp/ for Amazon", () => {
    expect(canonicalProductUrl("10450114", "walmart.com", "", "walmart")).toBe(
      "https://www.walmart.com/ip/10450114",
    );
    expect(canonicalProductUrl("B01JGG5CH4", "amazon.com", "")).toBe(
      "https://www.amazon.com/dp/B01JGG5CH4",
    );
  });
});

describe("buildAffiliateLink (Walmart)", () => {
  const config: RoutingConfig = {
    enabled: true,
    primaryDeeplinkProvider: null,
    affiliateNetworks: [],
    walmartLinkProvider: "impact",
    perCountryTags: {},
    storefrontHandle: null,
  };
  const creds = async () => ({ accountSid: "1234567", campaignId: "2003851", adId: "9" });

  it("mints a Walmart link via the chosen provider, ignoring Amazon tags", async () => {
    const result = await buildAffiliateLink(
      { asin: "10450114", marketplace: "walmart.com", url: "https://www.walmart.com/ip/10450114", retailer: "walmart" },
      config,
      creds,
    );
    expect(result.url).toBe(
      "https://goto.walmart.com/c/1234567/2003851/9?u=https%3A%2F%2Fwww.walmart.com%2Fip%2F10450114",
    );
  });

  it("returns the plain /ip/ url when no Walmart provider is chosen", async () => {
    const result = await buildAffiliateLink(
      { asin: "10450114", marketplace: "walmart.com", retailer: "walmart" },
      { ...config, walmartLinkProvider: null },
      creds,
    );
    expect(result.url).toBe("https://www.walmart.com/ip/10450114");
  });
});
