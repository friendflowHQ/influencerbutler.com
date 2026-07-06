import { describe, it, expect } from "vitest";
import {
  buildCanonicalRequest,
  deriveSigningKey,
  hmac,
  normalizeGetItems,
  sha256Hex,
  signRequest,
  amzDate,
  marketplaceInfo,
} from "@/lib/paapi";

// AWS publishes a canonical SigV4 example ("get-vanilla" test suite / the
// "Signature Version 4 test suite" in the docs). Validating our signing
// building blocks against those fixed vectors proves the signer is correct
// independent of any PA-API specifics.
const AWS = {
  accessKeyId: "AKIDEXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
  region: "us-east-1",
  service: "service",
  amzDate: "20150830T123600Z",
  dateStamp: "20150830",
  host: "example.amazonaws.com",
};

describe("SigV4 signing building blocks", () => {
  it("hashes the empty payload to the known SHA-256", () => {
    expect(sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("derives AWS's documented signing key", () => {
    const key = deriveSigningKey(AWS.secretKey, AWS.dateStamp, AWS.region, AWS.service);
    // Signing key for the get-vanilla inputs; the downstream signature this
    // produces matches AWS's published get-vanilla vector (asserted below),
    // which is what proves this intermediate value correct.
    expect(key.toString("hex")).toBe(
      "938127b5336810ddb6a5d6af445fcac9e371f9ed418ed386b022aed82901be75",
    );
  });

  it("builds the documented canonical request and signature for get-vanilla", () => {
    // The get-vanilla case: GET / with only the Host and X-Amz-Date headers.
    const { canonicalRequest, signedHeaders } = buildCanonicalRequest({
      method: "GET",
      path: "/",
      query: "",
      headers: { host: AWS.host, "x-amz-date": AWS.amzDate },
      payload: "",
    });
    expect(signedHeaders).toBe("host;x-amz-date");
    expect(sha256Hex(canonicalRequest)).toBe(
      "bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63",
    );

    const scope = `${AWS.dateStamp}/${AWS.region}/${AWS.service}/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", AWS.amzDate, scope, sha256Hex(canonicalRequest)].join("\n");
    const signingKey = deriveSigningKey(AWS.secretKey, AWS.dateStamp, AWS.region, AWS.service);
    const signature = hmac(signingKey, stringToSign).toString("hex");
    expect(signature).toBe(
      "5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });

  it("signRequest returns Authorization + host + x-amz-date headers", () => {
    const headers = signRequest({
      method: "GET",
      host: AWS.host,
      path: "/",
      region: AWS.region,
      service: AWS.service,
      headers: {},
      payload: "",
      accessKeyId: AWS.accessKeyId,
      secretKey: AWS.secretKey,
      amzDate: AWS.amzDate,
    });
    expect(headers.host).toBe(AWS.host);
    expect(headers["x-amz-date"]).toBe(AWS.amzDate);
    expect(headers.Authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, " +
        "SignedHeaders=host;x-amz-date, " +
        "Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31",
    );
  });
});

describe("amzDate", () => {
  it("formats to YYYYMMDDTHHMMSSZ", () => {
    expect(amzDate(new Date("2026-07-06T09:08:07.123Z"))).toBe("20260706T090807Z");
  });
});

describe("marketplaceInfo", () => {
  it("maps known marketplaces to endpoint + region", () => {
    expect(marketplaceInfo("amazon.co.uk")).toEqual({
      paapiHost: "webservices.amazon.co.uk",
      region: "eu-west-1",
      marketplace: "www.amazon.co.uk",
    });
    expect(marketplaceInfo("AMAZON.COM.AU")?.region).toBe("us-west-2");
  });
  it("returns null for unknown marketplaces", () => {
    expect(marketplaceInfo("example.com")).toBeNull();
  });
});

describe("normalizeGetItems", () => {
  it("flattens a populated GetItems response", () => {
    const raw = {
      ItemsResult: {
        Items: [
          {
            DetailPageURL: "https://www.amazon.co.uk/dp/B0TEST?tag=x",
            ItemInfo: {
              Title: { DisplayValue: "Test Widget" },
              ByLineInfo: { Brand: { DisplayValue: "Acme" } },
              Classifications: { Binding: { DisplayValue: "Kitchen" } },
            },
            Images: { Primary: { Medium: { URL: "https://img/x.jpg" } } },
            Offers: {
              Listings: [
                {
                  Price: { DisplayAmount: "£12.99", Amount: 12.99, Currency: "GBP" },
                  Availability: { Message: "In Stock" },
                  DeliveryInfo: { IsPrimeEligible: true },
                },
              ],
            },
            BrowseNodeInfo: { BrowseNodes: [{ DisplayName: "Home & Kitchen" }] },
          },
        ],
      },
    };
    const item = normalizeGetItems("amazon.co.uk", raw);
    expect(item.found).toBe(true);
    expect(item.title).toBe("Test Widget");
    expect(item.brand).toBe("Acme");
    expect(item.priceDisplay).toBe("£12.99");
    expect(item.priceCents).toBe(1299);
    expect(item.currency).toBe("GBP");
    expect(item.availability).toBe("In Stock");
    expect(item.primeEligible).toBe(true);
    expect(item.browseNode).toBe("Home & Kitchen");
    expect(item.error).toBeNull();
  });

  it("treats NoResults as not-found without an error", () => {
    const item = normalizeGetItems("amazon.com.au", {
      Errors: [{ Code: "NoResults", Message: "No results" }],
    });
    expect(item.found).toBe(false);
    expect(item.error).toBeNull();
  });

  it("surfaces a real error code as an error", () => {
    const item = normalizeGetItems("amazon.com", {
      Errors: [{ Code: "InvalidParameterValue", Message: "PartnerTag invalid" }],
    });
    expect(item.found).toBe(false);
    expect(item.error).toBe("PartnerTag invalid");
  });
});
