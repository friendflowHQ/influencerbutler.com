// Query side of the ASIN membership Bloom filter. The hashing here MUST stay
// byte-for-byte identical to the server builder in src/lib/bloom.ts on the
// website, or membership checks disagree. Keep the two in sync.

export type LoadedFilter = { m: number; k: number; bits: Uint8Array };

function bloomHashes(key: string): [number, number] {
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

export function decodeBits(bitsBase64: string): Uint8Array {
  const binary = atob(bitsBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// Share of bits set. A filter sized for its item count sits near 0.5; one that
// was sized for far fewer items than it holds (the CC filter was built for the
// campaign count but fed every ASIN in the asin-index) climbs toward 1.0 and
// answers "yes" for every ASIN.
export function fillRatio(filter: LoadedFilter): number {
  let ones = 0;
  for (let i = 0; i < filter.bits.length; i++) {
    let v = filter.bits[i] ?? 0;
    while (v) {
      ones += v & 1;
      v >>= 1;
    }
  }
  return ones / filter.m;
}

export function bloomHas(filter: LoadedFilter, key: string): boolean {
  const [h1, h2] = bloomHashes(key);
  for (let i = 0; i < filter.k; i++) {
    const pos = (h1 + Math.imul(i, h2)) >>> 0;
    const bit = pos % filter.m;
    const byte = filter.bits[bit >>> 3] ?? 0;
    if ((byte & (1 << (bit & 7))) === 0) return false;
  }
  return true;
}
