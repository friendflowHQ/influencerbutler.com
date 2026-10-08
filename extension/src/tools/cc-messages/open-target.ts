// How a brand's conversation is addressed from outside Creator Connections.
// Amazon has no thread URL: a conversation opens only by clicking its row in the
// Messages drawer, or by pressing "Message brand" on one of the brand's campaign
// pages. So a link from another page (an Amazon search page chip) carries the
// brand in the URL hash, and the Creator Connections content script finishes the
// job when the page loads. Pure so it is unit-tested; open-conversation.ts does the
// clicking.

import { normalizeBrand } from "../brand-keywords/normalize";

const HASH_KEY = "ib-open-thread";

// The page a chip opens from outside Creator Connections: the campaigns list,
// which always mounts the Messages drawer.
export const CC_ENTRY_URL = "https://affiliate-program.amazon.com/p/connect/requests";

export function buildOpenHash(brand: string): string {
  return `#${HASH_KEY}=${encodeURIComponent(brand.trim())}`;
}

export function buildOpenUrl(brand: string, base: string = CC_ENTRY_URL): string {
  return `${base}${buildOpenHash(brand)}`;
}

// The brand a `#ib-open-thread=<brand>` hash asks for, or null.
export function parseOpenHash(hash: string): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  for (const part of raw.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0 || part.slice(0, eq) !== HASH_KEY) continue;
    try {
      const brand = decodeURIComponent(part.slice(eq + 1)).trim();
      return brand ? brand.slice(0, 200) : null;
    } catch {
      return null;
    }
  }
  return null;
}

// Whether a drawer row's brand text is the brand we were asked for: exact on the
// normalized name, then space-insensitive (the same fallback Brand Keywords uses).
export function brandMatches(rowBrand: string, wanted: string): boolean {
  const a = normalizeBrand(rowBrand);
  const b = normalizeBrand(wanted);
  if (!a || !b) return false;
  return a === b || a.replace(/\s+/g, "") === b.replace(/\s+/g, "");
}

// The campaign detail URL for a campaign id on the creator's marketplace host.
export function campaignDetailUrl(origin: string, campaignId: string, brand: string): string {
  return `${origin}/p/connect/request?campaignId=${encodeURIComponent(campaignId)}${buildOpenHash(brand)}`;
}
