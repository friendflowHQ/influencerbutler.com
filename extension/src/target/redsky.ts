// Target's product data layer. Target's own site reads everything from the
// "redsky" aggregation API (redsky.target.com), keyed by a public web key that
// ships in the page config (window.__CONFIG__.defaultServicesApiKey, seen
// 2026-10-07). The parsers here are pure so they unit-test without a DOM; the
// two fetchers are thin and report a bot wall as `blocked` rather than throwing.
//
// UNVERIFIED against live payloads: Target put a "Press & hold" bot challenge in
// front of the automated browser used to build this, so the field paths below
// come from the long-standing public shape of pdp_client_v1 / plp_search_v2 and
// are read defensively (every access is optional, a missing field is null, a
// moved field degrades to "couldn't check", never a wrong claim). Verify on a
// real Chrome session before relying on them.

import { TARGET_TCIN_RE } from "../shared/retailer";

export const TARGET_MARKETPLACE = "target.com";
const REDSKY_BASE = "https://redsky.target.com/redsky_aggregations/v1/web";

// The web key Target's own page config publishes. Used only when the key cannot
// be read from the page (the worker has no DOM).
export const TARGET_DEFAULT_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";
// A store id is needed for pricing; any valid one returns the national price.
const DEFAULT_STORE_ID = "3991";

export type TargetProduct = {
  tcin: string | null;
  title: string | null;
  brand: string | null;
  priceCents: number | null;
  upc: string | null;
  inStock: boolean | null;
  averageRating: number | null;
  numReviews: number | null;
  imageUrl: string | null;
};

export const EMPTY_TARGET_PRODUCT: TargetProduct = {
  tcin: null,
  title: null,
  brand: null,
  priceCents: null,
  upc: null,
  inStock: null,
  averageRating: null,
  numReviews: null,
  imageUrl: null,
};

export function targetProductUrl(tcin: string): string {
  return `https://www.target.com/p/-/A-${tcin}`;
}

export function targetSearchUrl(term: string): string {
  return `https://www.target.com/s?searchTerm=${encodeURIComponent(term)}`;
}

// The TCIN out of /p/<slug>/-/A-<tcin>, or null.
export function extractTcin(url: string): string | null {
  const tcin = url.match(/\/-\/A-(\d{7,10})(?:[/?#]|$)/)?.[1];
  return tcin && TARGET_TCIN_RE.test(tcin) ? tcin : null;
}

// Target titles arrive HTML-escaped ("&#34;", "&amp;").
export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Obj) : null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function dollarsToCents(v: unknown): number | null {
  const n = num(v);
  return n != null ? Math.round(n * 100) : null;
}

// Digits only, for the barcode. Target's primary_barcode is a 12/13/14 digit
// string; anything shorter than a real barcode is dropped.
export function cleanBarcode(v: unknown): string | null {
  const s = typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "";
  return s.length >= 8 ? s : null;
}

// Pure parse of one product object (pdp_client_v1 `data.product`, or one entry of
// plp_search_v2 `data.search.products`, which carries the same item/price shape).
export function parseTargetProductNode(node: unknown): TargetProduct | null {
  const p = obj(node);
  if (!p) return null;
  const item = obj(p.item);
  const desc = obj(item?.product_description);
  const price = obj(p.price);
  const stats = obj(obj(p.ratings_and_reviews)?.statistics);
  const rating = obj(stats?.rating);
  const enrichment = obj(item?.enrichment);
  const images = obj(enrichment?.images);
  const title = str(desc?.title);
  return {
    tcin: str(p.tcin) ?? (num(p.tcin) != null ? String(num(p.tcin)) : null),
    title: title ? decodeEntities(title) : null,
    brand: str(obj(item?.primary_brand)?.name),
    priceCents: dollarsToCents(price?.current_retail ?? price?.current_retail_min ?? price?.reg_retail),
    upc: cleanBarcode(item?.primary_barcode),
    inStock: null,
    averageRating: num(rating?.average),
    numReviews: num(rating?.count) ?? num(stats?.review_count),
    imageUrl: str(images?.primary_image_url),
  };
}

export function parsePdpResponse(json: unknown): TargetProduct | null {
  return parseTargetProductNode(obj(obj(json)?.data)?.product);
}

export function parseSearchResponse(json: unknown): TargetProduct[] {
  const list = obj(obj(obj(json)?.data)?.search)?.products;
  if (!Array.isArray(list)) return [];
  const out: TargetProduct[] = [];
  for (const node of list) {
    const p = parseTargetProductNode(node);
    if (p?.tcin) out.push(p);
  }
  return out;
}

export type RedskyResult<T> =
  | { status: "ok"; value: T }
  // The bot wall (HTTP 435 / captcha page) or any non-JSON answer. The caller
  // must report this as "couldn't check", never as "not found".
  | { status: "blocked" }
  | { status: "error" };

async function getJson(url: string, credentials: RequestCredentials): Promise<RedskyResult<unknown>> {
  try {
    const res = await fetch(url, { credentials });
    if (res.status === 435 || res.status === 403 || res.status === 429) return { status: "blocked" };
    const text = await res.text();
    // The wall answers with an HTML challenge page, sometimes with a 200.
    if (text.trimStart().startsWith("<")) return { status: "blocked" };
    if (!res.ok) return { status: "error" };
    return { status: "ok", value: JSON.parse(text) as unknown };
  } catch {
    return { status: "error" };
  }
}

function qs(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join("&");
}

// One product by TCIN. `credentials: "include"` rides the user's own Target
// session (the cookies the bot wall trusts); from the product page itself it is a
// normal same-site call.
export async function fetchTargetPdp(
  tcin: string,
  key: string = TARGET_DEFAULT_KEY,
): Promise<RedskyResult<TargetProduct | null>> {
  const url = `${REDSKY_BASE}/pdp_client_v1?${qs({
    key,
    tcin,
    channel: "WEB",
    is_bot: "false",
    pricing_store_id: DEFAULT_STORE_ID,
    has_pricing_store_id: "true",
    page: `/p/A-${tcin}`,
  })}`;
  const res = await getJson(url, "include");
  return res.status === "ok" ? { status: "ok", value: parsePdpResponse(res.value) } : res;
}

// Top results for a keyword (a UPC works as a keyword on Target).
export async function searchTarget(
  keyword: string,
  key: string = TARGET_DEFAULT_KEY,
): Promise<RedskyResult<TargetProduct[]>> {
  const url = `${REDSKY_BASE}/plp_search_v2?${qs({
    key,
    channel: "WEB",
    count: "5",
    offset: "0",
    keyword,
    page: `/s/${keyword}`,
    platform: "desktop",
    pricing_store_id: DEFAULT_STORE_ID,
    default_purchasability_filter: "false",
  })}`;
  const res = await getJson(url, "include");
  return res.status === "ok" ? { status: "ok", value: parseSearchResponse(res.value) } : res;
}

export type TargetUpcMatch = {
  product: TargetProduct;
  // "upc": the product's own barcode equals the one we searched for (verified
  // through its product record). "similar": Target's search returned it for the
  // barcode but the barcode could not be confirmed.
  matchType: "upc" | "similar";
};

function sameBarcode(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.replace(/^0+/, "") === b.replace(/^0+/, "");
}

// The Target product for a barcode, or none. Searches by UPC, then confirms the
// top hits' own barcodes through the product record (search results do not
// reliably carry one), so an "upc" match is never a loose keyword hit.
export async function findTargetByUpc(
  upc: string,
  key: string = TARGET_DEFAULT_KEY,
): Promise<RedskyResult<TargetUpcMatch | null>> {
  const search = await searchTarget(upc, key);
  if (search.status !== "ok") return search;
  const candidates = search.value.slice(0, 3);
  const first = candidates[0];
  if (!first) return { status: "ok", value: null };
  for (const c of candidates) {
    if (sameBarcode(c.upc, upc)) return { status: "ok", value: { product: c, matchType: "upc" } };
  }
  for (const c of candidates) {
    if (!c.tcin) continue;
    const pdp = await fetchTargetPdp(c.tcin, key);
    if (pdp.status !== "ok") return pdp;
    if (pdp.value && sameBarcode(pdp.value.upc, upc)) {
      return { status: "ok", value: { product: { ...c, ...pdp.value, tcin: c.tcin }, matchType: "upc" } };
    }
  }
  // Search answered for this barcode but nothing could be confirmed: offer the
  // top hit as a possible match only. A barcode keyword that returns a product is
  // almost always it, but "almost" is what the label says.
  return { status: "ok", value: { product: first, matchType: "similar" } };
}
