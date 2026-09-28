import { afterEach, describe, expect, it, vi } from "vitest";
import { walmartLinkAdapters } from "./adapters/walmart-link";
import { looksSignedOutUrl } from "./walmart-creator-mint";
import { buildAffiliateLink, type RoutingConfig } from "./routing";
import { canonicalProductUrl } from "./url";
import type { LinkTarget } from "./types";

const mavely = walmartLinkAdapters.find((a) => a.id === "mavely")!;

const target: LinkTarget = {
  asin: "10450114",
  marketplace: "walmart.com",
  url: "https://www.walmart.com/ip/10450114",
  retailer: "walmart",
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mavelyAdapter.generateLink", () => {
  it("posts the createAffiliateLink mutation with the session cookie and returns the short link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { data: { createAffiliateLink: { link: "https://mave.ly/abc123" } } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const link = await mavely.generateLink!(target, {});
    expect(link).toBe("https://mave.ly/abc123");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://creators.joinmavely.com/api/graphql");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    const body = JSON.parse(String(init.body)) as { query: string; variables: { url: string } };
    expect(body.query).toContain("createAffiliateLink");
    expect(body.variables).toEqual({ url: target.url });
  });

  it("raises the signInRequired notice on a 401", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    await expect(mavely.generateLink!(target, {})).rejects.toMatchObject({
      notice: "signInRequired",
    });
  });

  it("raises the signInRequired notice on an unauth-looking GraphQL error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { errors: [{ message: "Not signed in" }] })),
    );
    await expect(mavely.generateLink!(target, {})).rejects.toMatchObject({
      notice: "signInRequired",
    });
  });

  it("throws a plain error on any other GraphQL error or a missing link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { errors: [{ message: "rate limited" }] })),
    );
    await expect(mavely.generateLink!(target, {})).rejects.toThrow("rate limited");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { data: { createAffiliateLink: {} } })),
    );
    await expect(mavely.generateLink!(target, {})).rejects.toThrow("no link");
  });
});

describe("mavelyAdapter.test", () => {
  it("reports the signed-in session's email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(200, { user: { email: "creator@example.com" } })),
    );
    const outcome = await mavely.test({});
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toContain("creator@example.com");
  });

  it("asks the user to sign in when the session is empty", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, {})));
    const outcome = await mavely.test({});
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("creators.joinmavely.com");
  });
});

describe("looksSignedOutUrl", () => {
  it("flags the Walmart sign-in surfaces and nothing else", () => {
    expect(looksSignedOutUrl("https://identity.walmart.com/account/login?x=1")).toBe(true);
    expect(looksSignedOutUrl("https://www.walmart.com/account/login")).toBe(true);
    expect(looksSignedOutUrl("https://creator.walmart.com/sign-in")).toBe(true);
    expect(looksSignedOutUrl("https://creator.walmart.com/")).toBe(false);
    expect(looksSignedOutUrl("https://creator.walmart.com/home")).toBe(false);
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
    walmartLinkProvider: "mavely",
    perCountryTags: {},
    storefrontHandle: null,
  };
  const creds = async () => ({});

  it("mints a Walmart link via the chosen provider, ignoring Amazon tags", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse(200, { data: { createAffiliateLink: { link: "https://mave.ly/abc123" } } }),
      ),
    );
    const result = await buildAffiliateLink(
      { asin: "10450114", marketplace: "walmart.com", url: target.url, retailer: "walmart" },
      config,
      creds,
    );
    expect(result.url).toBe("https://mave.ly/abc123");
    expect(result.notice).toBeUndefined();
  });

  it("falls back to the plain /ip/ url with a notice when the provider needs a sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, {})));
    const result = await buildAffiliateLink(
      { asin: "10450114", marketplace: "walmart.com", retailer: "walmart" },
      config,
      creds,
    );
    expect(result.url).toBe("https://www.walmart.com/ip/10450114");
    expect(result.notice).toBe("signInRequired");
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
