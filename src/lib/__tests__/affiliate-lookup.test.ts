import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { appendAffRef, lookupAffiliateByCode } from "../affiliate-lookup";

// --- Module-level Supabase mock ------------------------------------------
// `lookupAffiliateByCode` imports `createServerClient` from `@supabase/ssr`
// and uses it to query `profiles`. We stub it with an injectable mock that
// records the (table, column, value) used for each query so we can assert
// case-insensitivity AND verify the wire call.

const ilikeMock = vi.fn();
const limitMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    from: (_table: string) => ({
      select: (_cols: string) => ({
        ilike: (col: string, value: string) => {
          ilikeMock(col, value);
          return {
            limit: (n: number) => {
              limitMock(n);
              return Promise.resolve(currentResponse);
            },
          };
        },
      }),
    }),
  }),
}));

type LookupRow = { ls_affiliate_id?: string | null; affiliate_code?: string | null };

let currentResponse: { data: LookupRow[] | null; error: unknown } = {
  data: null,
  error: null,
};

function setResponse(data: LookupRow[] | null, error: unknown = null) {
  currentResponse = { data, error };
}

describe("appendAffRef", () => {
  it("appends aff_ref to a well-formed URL", () => {
    const out = appendAffRef("https://app.lemonsqueezy.com/checkout/buy/abc", "12345");
    expect(out).toBe("https://app.lemonsqueezy.com/checkout/buy/abc?aff_ref=12345");
  });

  it("replaces an existing aff_ref rather than duplicating it", () => {
    const out = appendAffRef(
      "https://app.lemonsqueezy.com/checkout/buy/abc?aff_ref=99999",
      "12345",
    );
    expect(out).toBe("https://app.lemonsqueezy.com/checkout/buy/abc?aff_ref=12345");
  });

  it("preserves other query params", () => {
    const out = appendAffRef(
      "https://app.lemonsqueezy.com/checkout/buy/abc?discount_code=LIZ&utm_source=email",
      "12345",
    );
    const parsed = new URL(out);
    expect(parsed.searchParams.get("aff_ref")).toBe("12345");
    expect(parsed.searchParams.get("discount_code")).toBe("LIZ");
    expect(parsed.searchParams.get("utm_source")).toBe("email");
  });

  it("preserves hash fragments", () => {
    const out = appendAffRef(
      "https://app.lemonsqueezy.com/checkout/buy/abc#thankyou",
      "12345",
    );
    const parsed = new URL(out);
    expect(parsed.searchParams.get("aff_ref")).toBe("12345");
    expect(parsed.hash).toBe("#thankyou");
  });

  it("URL-encodes affiliate ids that contain special chars", () => {
    const out = appendAffRef("https://example.com/", "id with spaces & symbols");
    const parsed = new URL(out);
    expect(parsed.searchParams.get("aff_ref")).toBe("id with spaces & symbols");
  });

  it("falls back gracefully when given a non-parseable URL", () => {
    // appendAffRef shouldn't throw on malformed input - it has a try/catch
    // fallback that uses raw string concatenation. Verify both branches.
    const out = appendAffRef("not a url", "12345");
    // Either fallback returns "?aff_ref=12345" appended, or URL parses it as
    // a relative path. Both are acceptable; what matters is no throw + aff_ref present.
    expect(out).toContain("aff_ref=12345");
  });

  it("uses ? when URL has no query string", () => {
    const out = appendAffRef("https://example.com/landing", "abc");
    expect(out).toBe("https://example.com/landing?aff_ref=abc");
  });

  it("uses & when URL already has a query string", () => {
    const out = appendAffRef("https://example.com/landing?ref=x", "abc");
    const parsed = new URL(out);
    expect(parsed.searchParams.get("ref")).toBe("x");
    expect(parsed.searchParams.get("aff_ref")).toBe("abc");
  });
});

describe("lookupAffiliateByCode", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
    ilikeMock.mockClear();
    limitMock.mockClear();
    setResponse(null, null);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("returns null when service-role key is missing (don't leak unauthenticated queries)", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = await lookupAffiliateByCode("LIZ");
    expect(result).toBeNull();
    expect(ilikeMock).not.toHaveBeenCalled();
  });

  it("returns null when supabase URL is missing", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const result = await lookupAffiliateByCode("LIZ");
    expect(result).toBeNull();
    expect(ilikeMock).not.toHaveBeenCalled();
  });

  it("resolves an uppercase code to the row's canonical code (case-insensitive via ilike)", async () => {
    setResponse([{ ls_affiliate_id: "111", affiliate_code: "LIZ" }]);
    const result = await lookupAffiliateByCode("LIZ");
    expect(result).toEqual({ lsAffiliateId: "111", code: "LIZ" });
    expect(ilikeMock).toHaveBeenCalledWith("affiliate_code", "LIZ");
  });

  it("resolves a lowercase code by matching against the uppercase row", async () => {
    setResponse([{ ls_affiliate_id: "111", affiliate_code: "LIZ" }]);
    const result = await lookupAffiliateByCode("liz");
    // Returned code is the canonical (DB) value, NOT the typed input - this
    // matters because the canonical code is what gets applied at LS checkout.
    expect(result).toEqual({ lsAffiliateId: "111", code: "LIZ" });
  });

  it("returns null on no match", async () => {
    setResponse([]);
    const result = await lookupAffiliateByCode("NOPE");
    expect(result).toBeNull();
  });

  it("returns null when the matched row has no ls_affiliate_id", async () => {
    // This is the v2.0.x bug class - application was approved but profile
    // never got the ls_affiliate_id from the webhook. We should NOT credit
    // an affiliate whose LS account isn't actually wired up.
    setResponse([{ ls_affiliate_id: null, affiliate_code: "LIZ" }]);
    const result = await lookupAffiliateByCode("LIZ");
    expect(result).toBeNull();
  });

  it("returns null when the matched row has no affiliate_code (defensive)", async () => {
    setResponse([{ ls_affiliate_id: "111", affiliate_code: null }]);
    const result = await lookupAffiliateByCode("LIZ");
    expect(result).toBeNull();
  });

  it("returns null and does not throw on supabase error", async () => {
    setResponse(null, { message: "boom" });
    const result = await lookupAffiliateByCode("LIZ");
    expect(result).toBeNull();
  });

  it("limits to 1 row (no accidental enumeration)", async () => {
    setResponse([{ ls_affiliate_id: "111", affiliate_code: "LIZ" }]);
    await lookupAffiliateByCode("LIZ");
    expect(limitMock).toHaveBeenCalledWith(1);
  });

  it("preserves trailing-number suffixes (LIZ vs LIZ2)", async () => {
    setResponse([{ ls_affiliate_id: "222", affiliate_code: "LIZ2" }]);
    const result = await lookupAffiliateByCode("LIZ2");
    expect(result).toEqual({ lsAffiliateId: "222", code: "LIZ2" });
    // The two codes must NOT collide - ilike with the literal "LIZ2" should
    // not match "LIZ". (PostgREST ilike doesn't add wildcards unless we do.)
    expect(ilikeMock).toHaveBeenCalledWith("affiliate_code", "LIZ2");
  });

  it("does NOT wildcard the code (passing 'L' must not match 'LIZ')", async () => {
    setResponse([]);
    await lookupAffiliateByCode("L");
    // We assert by inspecting the literal value sent - no leading/trailing %.
    const [, value] = ilikeMock.mock.calls[ilikeMock.mock.calls.length - 1];
    expect(value).toBe("L");
    expect(value).not.toContain("%");
  });
});
