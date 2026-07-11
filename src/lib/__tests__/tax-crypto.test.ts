/**
 * Summary: Unit tests for AES-256-GCM TIN encryption (round-trip + tamper).
 * Dependencies: vitest, ../tax-crypto.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { encryptTin, decryptTin, tinLastFour, taxKeyConfigured } from "../tax-crypto";

beforeAll(() => {
  // 32 zero bytes, base64. Deterministic key just for the test process.
  process.env.TAX_FORM_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("tax-crypto", () => {
  it("round-trips a TIN through encrypt/decrypt", () => {
    const enc = encryptTin("123-45-6789");
    expect(enc.ciphertext).not.toContain("123");
    expect(decryptTin(enc)).toBe("123-45-6789");
  });

  it("produces a fresh IV each call (no ciphertext reuse)", () => {
    const a = encryptTin("123-45-6789");
    const b = encryptTin("123-45-6789");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("throws when the ciphertext is tampered (GCM auth tag fails)", () => {
    const enc = encryptTin("123-45-6789");
    const flipped = Buffer.from(enc.ciphertext, "base64");
    flipped[0] ^= 0xff;
    expect(() => decryptTin({ ...enc, ciphertext: flipped.toString("base64") })).toThrow();
  });

  it("reports the key as configured", () => {
    expect(taxKeyConfigured()).toBe(true);
  });

  it("tinLastFour strips formatting", () => {
    expect(tinLastFour("123-45-6789")).toBe("6789");
    expect(tinLastFour("12 3456789")).toBe("6789");
  });
});
