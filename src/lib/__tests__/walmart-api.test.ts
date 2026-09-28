import { describe, it, expect } from "vitest";
import { createVerify } from "node:crypto";
import {
  walmartCanonicalString,
  walmartSignature,
  walmartHeaders,
  normalizeWalmartItem,
  normalizeLookupBatch,
  type WalmartCreds,
} from "@/lib/walmart-api";

// A fixed 2048-bit RSA keypair (PKCS#8 / SPKI PEM) used only by this test. The
// signature Walmart wants is RSA-SHA256 over the canonical string; we sign with
// the private key and verify with the matching public key, which proves the
// signer is correct without needing Walmart's servers. The canonical string
// itself is asserted byte-for-byte, since a wrong order, a missing trailing
// newline, or a seconds-instead-of-ms timestamp is a 401 in production.
const PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7Zh4mENJE9XGu\nIwdYJsF1wEFT7Br8guA1gXijuNO+eynkKXn/RTSL/AxFTPVJYeH/3LgaUkG8ydHz\nu43OL0+JoyqqILwcJubr7Z/+3pHUsdu/70n0vX90Zc9VaS9TS4XQ4MlvLmbLwwGz\nEipd4iR++gaJG1kzLEGlKkpnZvQGV9VUdX3TnRsqWR2dOTiNjyucCnLLrrXkYP4c\n9ZO5b0+gRM2EJBkqbmaUBRfh2zVaHf/hZ1Igr2j2z5YXTlZf6lDnKiPdK2yTz7lq\nvaLGOgjCXuJP50exbIks9flMRmJ+3XAhEMNS4SpDy6JFZ1Osu7ESeX53fX/f1Gzx\nc6UDI+q5AgMBAAECggEADm9On/PAgJmP3sAZvRlqIjfziEN57iymGNT+3gya+dOK\nneWwfSBfbG93IgDsLXF92yutHjDrGZ/JnW67XPARvjo8a3OfTcNU2wQ4JGWQQdwL\n32BPF+wfVM/RTUTPhYjeF0FzXq4qMqSUHU8nRolIcqPvbDD4OVv9t/tWlRmt7w2D\n2vQrqiXN36M9F7cRFFkc3BRrSw6B2/LGjZSEyWKYdnN1egHvM2EXjJITVQAZ8OGH\nMv7bdUvb46reRWLkrOnWYxDoPykymA7BNd3exE1xoMi7AdbUj01+oyPDr2kohIS+\nvUPcoNAnGFzuozzTGagI5UTf+VkQRVR4jR3Kdu9PEQKBgQDtAwNeYA2fkQzXp3Sc\nmaeISJqr3DgeZKs4ENHOmI6IUoczvCyvNjeVFmHmQDAmEScldXusmQ5b5TIoFjgf\nKKKBmZeotzy//NATwDcJu4v/6/Ahu39J0yUY2zqk+dpGeqXgdMnLTaHVNhMb1DUl\n7qCEqHx9tB2lNZBS06RFHiRR6QKBgQDKaZIXOE4iE4VGQqOgC7ROmHkbsfqWIcQJ\nSTmTmbfBBPXZp4psZ2dvhrInCQQefj66F2598p15CHlIFY2qGDMmAZjhV4TJmMZd\n/Cr3otFIZldVfd3eya5RNQCKfg4eWlm9mtCEgKp43JrdcUfDyzIWF3qff8enx/bv\n7RI9jrYAUQKBgBfMxqjScmvEkAqTyTT0hQs9ZzK80XHT4BGoNrlNPnrX9rWuPrp1\nck1pSvlpFqyr6kdrrbieQf/eWxQFbytJ1E+5Ua5igBozU9233o7+o0dWtO1eO6D5\nL+94DEKGyHFtXXzVnXHp4MddP7v6qj+d38aSeLXSwWtWnqCCmitKpJEJAoGBAIFd\no89PXzCMRVu4b5d0o5KwBIdc4wldH0vIDxJ05mpo3zBy0heipwsyjV5Bdu5+RVzu\naOH6VAbtEYaur9IMkXQzBSDQrL+j8vRSnKuU1iltr1emkE05nT2toGDjW+auXDjA\nX5CwI0QHyrrJEdLjZWmVK/wQ0Ow882g4nrXVJiFhAoGATL8QMfN5iGYItr2BhU4o\nJA7QaKAGDnR7amZXB8OIuMCkzpJXs0T2iJX3jTIZGFCxBDvDfFW2spiX3oNeGo7S\nVFHD+0Q7EqJ6bvgMkdLpofSoHH1Nnn2pnp6eYoEnr1+1aiCf71uwZEHJcZhZwjxP\nZC6AQqU5/prEj52CNGAqu5E=\n-----END PRIVATE KEY-----\n";
const PUBLIC_KEY =
  "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu2YeJhDSRPVxriMHWCbB\ndcBBU+wa/ILgNYF4o7jTvnsp5Cl5/0U0i/wMRUz1SWHh/9y4GlJBvMnR87uNzi9P\niaMqqiC8HCbm6+2f/t6R1LHbv+9J9L1/dGXPVWkvU0uF0ODJby5my8MBsxIqXeIk\nfvoGiRtZMyxBpSpKZ2b0BlfVVHV9050bKlkdnTk4jY8rnApyy6615GD+HPWTuW9P\noETNhCQZKm5mlAUX4ds1Wh3/4WdSIK9o9s+WF05WX+pQ5yoj3Stsk8+5ar2ixjoI\nwl7iT+dHsWyJLPX5TEZift1wIRDDUuEqQ8uiRWdTrLuxEnl+d31/39Rs8XOlAyPq\nuQIDAQAB\n-----END PUBLIC KEY-----\n";

const CREDS: WalmartCreds = {
  consumerId: "a1b2c3d4-0000-1111-2222-333344445555",
  keyVersion: "2",
  privateKeyPem: PRIVATE_KEY,
};
const TS = 1_724_112_000_000; // fixed epoch ms

describe("walmartCanonicalString", () => {
  it("joins consumer id, ms timestamp, and key version, each newline-terminated", () => {
    expect(walmartCanonicalString(CREDS.consumerId, TS, CREDS.keyVersion)).toBe(
      "a1b2c3d4-0000-1111-2222-333344445555\n1724112000000\n2\n",
    );
  });
});

describe("walmartSignature", () => {
  it("produces an RSA-SHA256 signature that verifies against the public key", () => {
    const sig = walmartSignature(CREDS, TS);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(walmartCanonicalString(CREDS.consumerId, TS, CREDS.keyVersion));
    expect(verifier.verify(PUBLIC_KEY, sig, "base64")).toBe(true);
  });

  it("does not verify when the timestamp differs (signature binds the canonical string)", () => {
    const sig = walmartSignature(CREDS, TS);
    const verifier = createVerify("RSA-SHA256");
    verifier.update(walmartCanonicalString(CREDS.consumerId, TS + 1, CREDS.keyVersion));
    expect(verifier.verify(PUBLIC_KEY, sig, "base64")).toBe(false);
  });
});

describe("walmartHeaders", () => {
  it("carries the full required header set", () => {
    const headers = walmartHeaders(CREDS, TS);
    expect(headers["WM_CONSUMER.ID"]).toBe(CREDS.consumerId);
    expect(headers["WM_CONSUMER.INTIMESTAMP"]).toBe("1724112000000");
    expect(headers["WM_SEC.KEY_VERSION"]).toBe("2");
    expect(headers["WM_SEC.AUTH_SIGNATURE"]).toBe(walmartSignature(CREDS, TS));
    expect(headers.Accept).toBe("application/json");
  });
});

describe("normalizeWalmartItem", () => {
  it("maps a populated Walmart product into the shared EnrichedItem shape", () => {
    const item = normalizeWalmartItem({
      itemId: 987654321,
      name: "Test Blender",
      brandName: "Acme",
      salePrice: 24.88,
      currency: "USD",
      stock: "Available",
      mediumImage: "https://i5.walmartimages.com/x.jpg",
      productTrackingUrl: "https://goto.walmart.com/c/track/ip/987654321",
      numReviews: 1420,
      bestSellerRank: 37,
      categoryPath: "Home/Kitchen/Blenders",
    });
    expect(item.retailer).toBe("walmart");
    expect(item.itemId).toBe("987654321");
    expect(item.asin).toBeNull();
    expect(item.title).toBe("Test Blender");
    expect(item.brand).toBe("Acme");
    expect(item.priceCents).toBe(2488);
    expect(item.priceDisplay).toBe("$24.88");
    expect(item.currency).toBe("USD");
    expect(item.availability).toBe("Available");
    expect(item.imageUrl).toBe("https://i5.walmartimages.com/x.jpg");
    expect(item.detailPageUrl).toBe("https://goto.walmart.com/c/track/ip/987654321");
    expect(item.numReviews).toBe(1420);
    expect(item.retailerRank).toBe(37);
    expect(item.primeEligible).toBeNull();
    expect(item.error).toBeNull();
  });
});

describe("normalizeLookupBatch", () => {
  it("returns one row per requested id, correlated by item id, order preserved", () => {
    const raw = {
      items: [
        { itemId: 222, name: "Second" },
        { itemId: 111, name: "First", salePrice: 5 },
      ],
    };
    const rows = normalizeLookupBatch(raw, ["111", "222", "333"]);
    expect(rows.map((r) => r.itemId)).toEqual(["111", "222", "333"]);
    expect(rows[0].title).toBe("First");
    expect(rows[0].priceCents).toBe(500);
    expect(rows[1].title).toBe("Second");
    // The id Walmart did not return is a not-found row carrying its id.
    expect(rows[2].found).toBe(false);
    expect(rows[2].error).toBeNull();
    expect(rows[2].itemId).toBe("333");
  });

  it("stamps a top-level error onto every requested id when no items come back", () => {
    const rows = normalizeLookupBatch(
      { errors: [{ code: "GATEWAY_ERROR", message: "throttled" }] },
      ["111", "222"],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.error === "throttled")).toBe(true);
    expect(rows.map((r) => r.itemId)).toEqual(["111", "222"]);
  });
});
