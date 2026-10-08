// The two facts Amazon's chat API wants that the extension has to find for itself:
// the storefront id (sent as the `storeid` header; the page shows it as
// "StoreID: littleprettyl-20" in its header dropdown) and the creator's actor id
// (`amzn1.creator.<uuid>`). The MAIN-world connect-hook lifts both from the page's
// own requests; these pure helpers are the fallbacks read from the page itself.

const CREATOR_ID_RE = /amzn1\.creator\.[a-f0-9-]+/i;
const STORE_ID_TEXT_RE = /StoreID:?\s*([A-Za-z0-9_.]+-\d{1,3})\b/;

export type CcSession = { storeId: string; actorId: string };

export const EMPTY_SESSION: CcSession = { storeId: "", actorId: "" };

// The creator id rides in the CC page URL as `creatorId=` (campaign and request
// pages) or `actorId=` (a thread request).
export function parseActorIdFromUrl(href: string): string {
  const m = /[?&](?:creatorId|actorId)=([^&#]+)/i.exec(href);
  if (!m) return "";
  let value = m[1] ?? "";
  try {
    value = decodeURIComponent(value);
  } catch {
    // keep the raw value
  }
  const id = CREATOR_ID_RE.exec(value);
  return id ? id[0] : "";
}

export function parseActorIdFromText(text: string): string {
  const id = CREATOR_ID_RE.exec(text);
  return id ? id[0] : "";
}

// "StoreID:  littleprettyl-20" from the header's store switcher.
export function parseStoreIdFromText(text: string): string {
  const m = STORE_ID_TEXT_RE.exec(text);
  return m ? (m[1] ?? "") : "";
}

// Combine sources in priority order: whatever the page's own requests showed
// first, then what was stored from an earlier visit, then page fallbacks.
export function mergeSession(...sources: Array<Partial<CcSession> | null | undefined>): CcSession {
  let storeId = "";
  let actorId = "";
  for (const source of sources) {
    if (!source) continue;
    if (!storeId && typeof source.storeId === "string") storeId = source.storeId.trim();
    if (!actorId && typeof source.actorId === "string") actorId = source.actorId.trim();
  }
  return { storeId, actorId };
}

export function normalizeSession(raw: unknown): CcSession {
  if (!raw || typeof raw !== "object") return { ...EMPTY_SESSION };
  const r = raw as Record<string, unknown>;
  return mergeSession({
    storeId: typeof r.storeId === "string" ? r.storeId : "",
    actorId: typeof r.actorId === "string" && CREATOR_ID_RE.test(r.actorId) ? r.actorId : "",
  });
}
