/**
 * Minimal Bloom filter for ASIN membership ("does this product have a CC /
 * SPCC campaign?"). Built server-side from the R2 catalogue, queried in the
 * Chrome extension. The hashing here MUST stay byte-for-byte identical to the
 * extension's copy in extension/src/catalogue/bloom.ts, or lookups disagree.
 *
 * Format (what gets stored + shipped): { m, k, bitsBase64 } where m is the bit
 * count, k the number of hash probes, and bitsBase64 the base64 of the m/8
 * byte array. Standard double-hashing (Kirsch-Mitzenmacher): bit positions are
 * (h1 + i*h2) mod m for i in [0, k).
 */

export type BloomParams = { m: number; k: number };
export type SerializedBloom = { m: number; k: number; bitsBase64: string };

// FNV-1a 32-bit and a second independent hash, both over the UTF-8 bytes of
// the (upper-cased) ASIN. ASINs are ASCII, so char codes are the bytes.
export function bloomHashes(key: string): [number, number] {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (Math.imul(h2 ^ c, 0x85ebca6b) >>> 0) + 1;
    h2 >>>= 0;
  }
  return [h1 >>> 0, (h2 >>> 0) || 1];
}

export function optimalParams(count: number, fpr = 0.01): BloomParams {
  const n = Math.max(1, count);
  const mRaw = Math.ceil((-n * Math.log(fpr)) / (Math.LN2 * Math.LN2));
  const m = Math.max(8, Math.ceil(mRaw / 8) * 8); // byte-aligned
  const k = Math.max(1, Math.round((m / n) * Math.LN2));
  return { m, k };
}

export function buildBloom(asins: Iterable<string>, count: number, fpr = 0.01): SerializedBloom {
  const builder = buildBloomStreaming(count, fpr);
  for (const asin of asins) builder.add(asin);
  return builder.serialize();
}

// Incremental builder: size the bit array once from an expected count, then
// add() while streaming millions of rows without holding them all in memory.
export function buildBloomStreaming(count: number, fpr = 0.01) {
  const { m, k } = optimalParams(count, fpr);
  const bits = new Uint8Array(m / 8);
  return {
    add: (key: string) => setBits(bits, m, k, key),
    serialize: (): SerializedBloom => ({ m, k, bitsBase64: Buffer.from(bits).toString("base64") }),
  };
}

export function setBits(bits: Uint8Array, m: number, k: number, key: string): void {
  const [h1, h2] = bloomHashes(key);
  for (let i = 0; i < k; i++) {
    const pos = (h1 + Math.imul(i, h2)) >>> 0;
    const bit = pos % m;
    bits[bit >>> 3] |= 1 << (bit & 7);
  }
}

export function hasBits(bits: Uint8Array, m: number, k: number, key: string): boolean {
  const [h1, h2] = bloomHashes(key);
  for (let i = 0; i < k; i++) {
    const pos = (h1 + Math.imul(i, h2)) >>> 0;
    const bit = pos % m;
    if ((bits[bit >>> 3] & (1 << (bit & 7))) === 0) return false;
  }
  return true;
}
