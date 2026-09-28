import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isLwaCredentialVersion,
  resolveTokenEndpoint,
  resolveCreatorsApiGroup,
  marketplaceInfo,
  normalizeGetItemsBatch,
  getItems,
  type CreatorsCreds,
} from "@/lib/creators-api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isLwaCredentialVersion", () => {
  it("treats major >= 3 as Login with Amazon", () => {
    expect(isLwaCredentialVersion("3.2")).toBe(true);
    expect(isLwaCredentialVersion("4.1")).toBe(true);
    expect(isLwaCredentialVersion("5.1")).toBe(true);
  });
  it("treats v2.x (and blanks) as Cognito", () => {
    expect(isLwaCredentialVersion("2.0")).toBe(false);
    expect(isLwaCredentialVersion("")).toBe(false);
  });
});

describe("resolveTokenEndpoint", () => {
  it("maps LWA regions for v3+ credentials", () => {
    expect(resolveTokenEndpoint("us-east-1", "3.1")).toBe("https://api.amazon.com/auth/o2/token");
    expect(resolveTokenEndpoint("eu-south-2", "4.1")).toBe("https://api.amazon.co.uk/auth/o2/token");
    expect(resolveTokenEndpoint("us-west-2", "5.1")).toBe("https://api.amazon.co.jp/auth/o2/token");
  });
  it("uses Cognito endpoints for v2 credentials", () => {
    expect(resolveTokenEndpoint("us-east-1", "2.0")).toBe(
      "https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token",
    );
  });
});

describe("resolveCreatorsApiGroup", () => {
  it("groups marketplaces by credential region", () => {
    expect(resolveCreatorsApiGroup("amazon.com")).toBe("NA");
    expect(resolveCreatorsApiGroup("amazon.co.uk")).toBe("EU");
    expect(resolveCreatorsApiGroup("amazon.co.jp")).toBe("FE");
    expect(resolveCreatorsApiGroup("amazon.nowhere")).toBe(null);
  });
  it("carries the default credential version per marketplace", () => {
    expect(marketplaceInfo("amazon.de")?.credentialVersion).toBe("4.1");
    expect(marketplaceInfo("amazon.in")?.credentialVersion).toBe("5.1");
  });
});

describe("normalizeGetItemsBatch", () => {
  it("maps a camelCase item and correlates by ASIN, filling not-found rows", () => {
    const raw = {
      itemsResult: {
        items: [
          {
            asin: "B000000001",
            detailPageUrl: "https://www.amazon.com/dp/B000000001",
            itemInfo: {
              title: { displayValue: "A Gift" },
              byLineInfo: { brand: { displayValue: "Acme" } },
              classifications: { binding: { displayValue: "Kitchen" } },
            },
            images: { primary: { medium: { url: "https://img/1.jpg" } } },
            browseNodeInfo: { browseNodes: [{ displayName: "Home" }] },
            offersV2: {
              listings: [
                {
                  price: { money: { displayAmount: "$19.99", amount: 19.99, currency: "USD" } },
                  availability: { message: "In Stock" },
                },
              ],
            },
          },
        ],
      },
    };
    const rows = normalizeGetItemsBatch("amazon.com", raw, ["B000000001", "B000000002"]);
    expect(rows).toHaveLength(2);
    const found = rows[0];
    expect(found.found).toBe(true);
    expect(found.asin).toBe("B000000001");
    expect(found.title).toBe("A Gift");
    expect(found.brand).toBe("Acme");
    expect(found.priceDisplay).toBe("$19.99");
    expect(found.priceCents).toBe(1999);
    expect(found.currency).toBe("USD");
    expect(found.availability).toBe("In Stock");
    expect(found.binding).toBe("Kitchen");
    expect(found.browseNode).toBe("Home");
    expect(found.imageUrl).toBe("https://img/1.jpg");
    const missing = rows[1];
    expect(missing.found).toBe(false);
    expect(missing.asin).toBe("B000000002");
  });

  it("does not surface a benign NoResults error as a row error", () => {
    const raw = { errors: [{ code: "NoResults", message: "no results" }] };
    const rows = normalizeGetItemsBatch("amazon.com", raw, ["B000000009"]);
    expect(rows[0].found).toBe(false);
    expect(rows[0].error).toBe(null);
  });
});

describe("getItems", () => {
  const creds: CreatorsCreds = {
    host: "amazon.com",
    partnerTag: "mytag-20",
    credentialId: "amzn1.application-oa2-client.test-getitems-1",
    credentialSecret: "shhh-super-secret-value",
    credentialVersion: "3.1",
  };

  it("mints a Bearer token then calls the catalog endpoint and normalizes rows", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "https://api.amazon.com/auth/o2/token") {
        // Assert the client_credentials body was sent.
        expect(String(init?.body)).toContain("grant_type=client_credentials");
        return new Response(JSON.stringify({ access_token: "tok-123" }), { status: 200 });
      }
      if (url === "https://creatorsapi.amazon/catalog/v1/getItems") {
        expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok-123");
        expect((init?.headers as Record<string, string>)["x-marketplace"]).toBe("www.amazon.com");
        return new Response(
          JSON.stringify({ itemsResult: { items: [{ asin: "B000000001", itemInfo: { title: { displayValue: "X" } } }] } }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getItems(creds, ["B000000001"]);
    expect(rows[0].found).toBe(true);
    expect(rows[0].title).toBe("X");
  });

  it("returns error rows (not throws) when the token request fails", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/auth/o2/token")) {
        return new Response(JSON.stringify({ error: "invalid_client" }), { status: 401 });
      }
      throw new Error("should not reach catalog");
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getItems(
      { ...creds, credentialId: "amzn1.application-oa2-client.test-getitems-2" },
      ["B000000001"],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].found).toBe(false);
    expect(rows[0].error).toContain("invalid_client");
  });
});
