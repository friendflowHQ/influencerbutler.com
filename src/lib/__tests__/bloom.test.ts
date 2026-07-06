import { describe, expect, it } from "vitest";
import { buildBloom, hasBits, optimalParams } from "../bloom";

function decode(bitsBase64: string): Uint8Array {
  return new Uint8Array(Buffer.from(bitsBase64, "base64"));
}

describe("bloom filter", () => {
  it("has no false negatives: every inserted ASIN is found", () => {
    const asins = Array.from({ length: 5000 }, (_, i) => `B${String(i).padStart(9, "0")}`);
    const bloom = buildBloom(asins, asins.length, 0.01);
    const bits = decode(bloom.bitsBase64);
    for (const asin of asins) {
      expect(hasBits(bits, bloom.m, bloom.k, asin)).toBe(true);
    }
  });

  it("keeps the false-positive rate near the target", () => {
    const asins = Array.from({ length: 5000 }, (_, i) => `IN${String(i).padStart(8, "0")}`);
    const bloom = buildBloom(asins, asins.length, 0.01);
    const bits = decode(bloom.bitsBase64);
    let fp = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
      if (hasBits(bits, bloom.m, bloom.k, `OUT${String(i).padStart(7, "0")}`)) fp++;
    }
    expect(fp / trials).toBeLessThan(0.03); // 1% target, generous ceiling
  });

  it("sizes m and k sensibly for the real CC catalogue count", () => {
    const { m, k } = optimalParams(728325, 0.01);
    expect(m % 8).toBe(0);
    expect(m / 8).toBeLessThan(1_000_000); // under ~1 MB
    expect(k).toBeGreaterThanOrEqual(5);
    expect(k).toBeLessThanOrEqual(8);
  });
});
