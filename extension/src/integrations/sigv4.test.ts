import { describe, it, expect } from "vitest";
import { amzDate, signPaapi } from "./sigv4";

// These golden values were produced by running this exact input through BOTH
// this in-browser signer AND the server signer in src/lib/paapi.ts (which is
// validated against AWS's published SigV4 "get-vanilla" vectors in
// src/lib/__tests__/paapi.test.ts). Both signers produce a byte-identical
// Authorization header, so this test guards against the two drifting apart.
//
// Regression context: the extension used to sign only
// content-encoding;host;x-amz-date;x-amz-target while still sending a
// content-type header. PA-API rejected that with a misleading
// "The Access Key ID or security token included in the request is invalid."
const INPUT = {
  accessKey: "AKIAIOSFODNN7EXAMPLE",
  secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
  host: "webservices.amazon.com",
  region: "us-east-1",
  service: "ProductAdvertisingAPI",
  path: "/paapi5/searchitems",
  target: "com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems",
  body: JSON.stringify({
    Keywords: "gift",
    SearchIndex: "All",
    ItemCount: 1,
    Resources: ["ItemInfo.Title"],
    PartnerTag: "mytag-20",
    PartnerType: "Associates",
    Marketplace: "www.amazon.com",
  }),
  amzDate: "20260824T000000Z",
};

const EXPECTED_AUTHORIZATION =
  "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20260824/us-east-1/" +
  "ProductAdvertisingAPI/aws4_request, " +
  "SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target, " +
  "Signature=e00544020b7505275d20c81faf8cb8dfbdf89ac36f0ff502ae05178c76f3449c";

describe("signPaapi", () => {
  it("signs every header it sends, including content-type", async () => {
    const signed = await signPaapi(INPUT);
    // The content-type header is sent...
    expect(signed.headers["content-type"]).toBe("application/json; charset=utf-8");
    // ...and it is covered by the signature's SignedHeaders list.
    expect(signed.headers.Authorization).toContain(
      "SignedHeaders=content-encoding;content-type;host;x-amz-date;x-amz-target",
    );
  });

  it("matches the AWS-vector-validated server signer byte for byte", async () => {
    const signed = await signPaapi(INPUT);
    expect(signed.headers.Authorization).toBe(EXPECTED_AUTHORIZATION);
    expect(signed.url).toBe("https://webservices.amazon.com/paapi5/searchitems");
    expect(signed.body).toBe(INPUT.body);
  });
});

describe("amzDate", () => {
  it("formats an ISO timestamp to YYYYMMDDTHHMMSSZ", () => {
    expect(amzDate("2026-08-24T00:00:00.000Z")).toBe("20260824T000000Z");
  });
});
