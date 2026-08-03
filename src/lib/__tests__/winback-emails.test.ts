/**
 * Summary: Unit tests for the win-back funnel's pure helpers - the segment
 *   router, the discount-percent env clamp, and the security-critical claim-link
 *   HMAC token (round-trips for the signed row, rejects tampering and forgery).
 * Dependencies: vitest, @/lib/winback-emails. A stable signing secret is set via
 *   env so the token functions are deterministic without a dedicated secret.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  resolveSegment,
  winbackDiscountPercent,
  winbackClaimToken,
  verifyWinbackClaimToken,
  winbackClaimUrl,
} from "@/lib/winback-emails";

beforeAll(() => {
  // Deterministic secret so token output is stable across runs.
  process.env.WINBACK_CLAIM_SECRET = "test-secret-winback";
});

describe("resolveSegment", () => {
  it("routes price cancels to the discount track", () => {
    expect(resolveSegment("too_expensive")).toBe("discount");
  });

  it("routes every other reason (and null) to the comp track", () => {
    for (const reason of [
      "technical_issues",
      "missing_features",
      "not_using",
      "just_testing",
      "found_alternative",
      "other",
      null,
      undefined,
    ]) {
      expect(resolveSegment(reason)).toBe("comp");
    }
  });
});

describe("winbackDiscountPercent", () => {
  it("defaults to 40 when unset or out of range", () => {
    delete process.env.WINBACK_DISCOUNT_PERCENT;
    expect(winbackDiscountPercent()).toBe(40);
    process.env.WINBACK_DISCOUNT_PERCENT = "0";
    expect(winbackDiscountPercent()).toBe(40);
    process.env.WINBACK_DISCOUNT_PERCENT = "100";
    expect(winbackDiscountPercent()).toBe(40);
    process.env.WINBACK_DISCOUNT_PERCENT = "notanumber";
    expect(winbackDiscountPercent()).toBe(40);
  });

  it("honors a valid override", () => {
    process.env.WINBACK_DISCOUNT_PERCENT = "55";
    expect(winbackDiscountPercent()).toBe(55);
    delete process.env.WINBACK_DISCOUNT_PERCENT;
  });
});

describe("winback claim token", () => {
  const rowId = "11111111-2222-3333-4444-555555555555";

  it("verifies a token it just signed", () => {
    const token = winbackClaimToken(rowId);
    expect(token.length).toBeGreaterThan(0);
    expect(verifyWinbackClaimToken(rowId, token)).toBe(true);
  });

  it("rejects a token bound to a different row (forgery)", () => {
    const token = winbackClaimToken(rowId);
    expect(verifyWinbackClaimToken("99999999-0000-0000-0000-000000000000", token)).toBe(false);
  });

  it("rejects a tampered or empty token", () => {
    const token = winbackClaimToken(rowId);
    expect(verifyWinbackClaimToken(rowId, token + "x")).toBe(false);
    expect(verifyWinbackClaimToken(rowId, "")).toBe(false);
    expect(verifyWinbackClaimToken(rowId, token.slice(0, -1))).toBe(false);
  });

  it("embeds the row id and a matching token in the claim URL", () => {
    const url = new URL(winbackClaimUrl(rowId));
    expect(url.pathname).toBe("/api/winback/claim");
    expect(url.searchParams.get("id")).toBe(rowId);
    const t = url.searchParams.get("t") ?? "";
    expect(verifyWinbackClaimToken(rowId, t)).toBe(true);
  });
});
