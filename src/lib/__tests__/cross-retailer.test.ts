import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { lookupByUpc, normalizeBarcode, type WalmartCreds } from "@/lib/walmart-api";
import { emptyEnrichedItem, type EnrichedItem } from "@/lib/enriched-item";
import { parseRequest, pickSimilar, toMatch, walmartProductUrl } from "@/lib/cross-retailer";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const CREDS: WalmartCreds = {
  consumerId: "test-consumer",
  keyVersion: "1",
  privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

function item(over: Partial<EnrichedItem>): EnrichedItem {
  return {
    ...emptyEnrichedItem({ retailer: "walmart", marketplace: "walmart.com", error: null, id: "1" }),
    found: true,
    ...over,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("normalizeBarcode", () => {
  it("treats UPC-A, EAN-13 and GTIN-14 spellings as equal", () => {
    expect(normalizeBarcode("016000275683")).toBe(normalizeBarcode("0016000275683"));
    expect(normalizeBarcode("00016000275683")).toBe(normalizeBarcode("016000275683"));
  });
  it("rejects short or non-barcode input", () => {
    expect(normalizeBarcode("123")).toBeNull();
    expect(normalizeBarcode(null)).toBeNull();
    expect(normalizeBarcode({})).toBeNull();
  });
});

describe("parseRequest", () => {
  it("keeps a numeric barcode and trims text", () => {
    expect(parseRequest({ upc: "016000275683", title: "  Cheerios  ", brand: "General Mills" })).toEqual({
      upc: "016000275683",
      title: "Cheerios",
      brand: "General Mills",
    });
  });
  it("drops a malformed barcode and tolerates a non-object body", () => {
    expect(parseRequest({ upc: "abc", title: "x" }).upc).toBeNull();
    expect(parseRequest(null)).toEqual({ upc: null, title: null, brand: null });
  });
});

describe("toMatch", () => {
  it("builds the plain product url, never the tracking url", () => {
    const m = toMatch(
      item({ itemId: "555", detailPageUrl: "https://goto.walmart.com/c/123/x", availability: "Available" }),
      "upc",
    );
    expect(m?.url).toBe(walmartProductUrl("555"));
    expect(m?.inStock).toBe(true);
  });
  it("reads 'Not available' as out of stock and no itemId as no match", () => {
    expect(toMatch(item({ itemId: "9", availability: "Not available" }), "upc")?.inStock).toBe(false);
    expect(toMatch(item({ itemId: null }), "upc")).toBeNull();
  });
});

describe("pickSimilar", () => {
  const q = { title: "Cheerios Heart Healthy Cereal 18 oz", brand: "General Mills" };

  it("accepts a candidate with matching brand and sizes", () => {
    const good = item({ itemId: "1", title: "General Mills Cheerios Heart Healthy Cereal, 18 oz", brand: "General Mills" });
    expect(pickSimilar([good], q)?.itemId).toBe("1");
  });
  it("rejects a different size so a bigger box never reads as the same product", () => {
    const big = item({ itemId: "2", title: "General Mills Cheerios Heart Healthy Cereal, 27 oz", brand: "General Mills" });
    expect(pickSimilar([big], q)).toBeNull();
  });
  it("rejects a different brand", () => {
    const other = item({ itemId: "3", title: "Great Value Honey Oat Cereal 18 oz", brand: "Great Value" });
    expect(pickSimilar([other], q)).toBeNull();
  });
  it("returns null when the source title is too short to match on", () => {
    expect(pickSimilar([item({ itemId: "4", title: "Milk", brand: "X" })], { title: "Milk", brand: "X" })).toBeNull();
  });
});

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body })),
  );
}

describe("lookupByUpc", () => {
  it("returns the hit only when its own barcode equals the request", async () => {
    stubFetch(200, { items: [{ itemId: 7, name: "Thing", upc: "016000275683" }] });
    const res = await lookupByUpc(CREDS, "016000275683");
    expect(res.ok).toBe(true);
    expect(res.item?.itemId).toBe("7");
  });
  it("ignores a hit with a different barcode (a loose server match)", async () => {
    stubFetch(200, { items: [{ itemId: 8, name: "Other", upc: "999999999999" }] });
    const res = await lookupByUpc(CREDS, "016000275683");
    expect(res).toEqual({ item: null, ok: true });
  });
  it("reports ok:false on an API error so the caller says 'couldn't check'", async () => {
    stubFetch(401, { errors: [{ code: "401", message: "bad signature" }] });
    expect(await lookupByUpc(CREDS, "016000275683")).toEqual({ item: null, ok: false });
  });
  it("reports ok:false when the network throws", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await lookupByUpc(CREDS, "016000275683")).ok).toBe(false);
  });
  it("treats an empty 200 as a genuine not-found", async () => {
    stubFetch(200, { items: [] });
    expect(await lookupByUpc(CREDS, "016000275683")).toEqual({ item: null, ok: true });
  });
});
