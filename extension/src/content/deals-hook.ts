// MAIN-world hook, injected at document_start on the Today's Deals grid
// (amazon.com/deals*).
//
// The deals grid is a React app whose product tiles never expose an ASIN in the
// DOM: the cards link to javascript:void(0) and open an in-page overlay instead
// of navigating to /dp/. The ASINs (with image + price) live only in the data
// the page fetches. The isolated-world content script cannot read the page's
// fetch responses, so this shim wraps fetch/XHR as a pure passthrough and, when
// a deals data response goes by, republishes a compact list of
// { asin, imageUrl, title, priceCents } to the content script via a DOM
// CustomEvent. Nothing is modified, blocked, or sent anywhere: it only listens.
// This mirrors src/content/connect-hook.ts (the campaign-fill data source).
//
// Verified live 2026-08-25 (anonymous): the grid fetches
//   https://data.amazon.com/api/marketplaces/<mp>/products/<ASIN,ASIN,...>
// (ASINs in the URL path) and an AppSync GraphQL feed
//   https://<id>.appsync-api.<region>.amazonaws.com/graphql
// whose body carries the deal records. Field names in the GraphQL body are not
// contract-stable, so the parser probes a handful of image/price/title keys and
// leaves anything it cannot find null (the overlay still gets the ASIN).

type DealItem = {
  asin: string;
  imageUrl: string | null;
  title: string | null;
  priceCents: number | null;
  currency: string;
};

(() => {
  const w = window as typeof window & { __ibDealsHooked?: boolean };
  if (w.__ibDealsHooked) return;
  w.__ibDealsHooked = true;

  // The products batch endpoint lists ASINs right in the path; the AppSync feed
  // carries the full records in its JSON body. Match either.
  const PRODUCTS_URL_RE = /\/api\/marketplaces\/[^/]+\/products\/([A-Z0-9,]+)/i;
  const GRAPHQL_URL_RE = /appsync-api\.[^/]+\.amazonaws\.com\/graphql/i;
  const ASIN_RE = /^[A-Z0-9]{10}$/;

  const toNum = (v: unknown): number | null =>
    typeof v === "number" && isFinite(v) ? v : null;

  const toStr = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  // Best-effort read of the first present value among candidate key names on a
  // record. The AppSync deal-record field names are not verified, so several
  // plausible spellings are probed; a miss simply leaves the field null.
  const pick = (rec: Record<string, unknown>, keys: string[]): unknown => {
    for (const k of keys) {
      if (rec[k] != null) return rec[k];
    }
    return undefined;
  };

  const readAsin = (rec: Record<string, unknown>): string | null => {
    const raw = toStr(pick(rec, ["asin", "ASIN", "productId", "productAsin"]));
    if (!raw) return null;
    const asin = raw.toUpperCase();
    return ASIN_RE.test(asin) ? asin : null;
  };

  const readImage = (rec: Record<string, unknown>): string | null => {
    const direct = toStr(pick(rec, ["imageUrl", "image", "imageURL", "primaryImage", "hiResImage"]));
    if (direct) return direct;
    // Some payloads nest the image under an object ({ image: { url } } / { lowRes }).
    const obj = pick(rec, ["image", "primaryImage", "productImage"]);
    if (obj && typeof obj === "object") {
      return toStr(pick(obj as Record<string, unknown>, ["url", "URL", "lowRes", "highRes", "src"]));
    }
    return null;
  };

  const readPriceCents = (rec: Record<string, unknown>): number | null => {
    // An explicit cents/amount field first, then a dollar value to convert.
    const cents = toNum(pick(rec, ["priceCents", "amountInCents", "dealPriceCents"]));
    if (cents !== null) return Math.round(cents);
    const dollars = toNum(pick(rec, ["price", "dealPrice", "buyingPrice", "amount", "priceValue"]));
    if (dollars !== null) return Math.round(dollars * 100);
    // Or a nested money object ({ price: { amount, currencyCode } }).
    const obj = pick(rec, ["price", "dealPrice", "buyingPrice", "displayPrice"]);
    if (obj && typeof obj === "object") {
      const amount = toNum(pick(obj as Record<string, unknown>, ["amount", "value", "amountInCents"]));
      if (amount !== null) {
        // Heuristic: a whole-dollar "amount" is far smaller than a cents value
        // for the same product, but we cannot know the unit for sure; treat a
        // value with a fractional part as dollars and an integer as dollars too
        // (Amazon money objects are dollars). Cents-named fields were handled
        // above.
        return Math.round(amount * 100);
      }
    }
    return null;
  };

  const readCurrency = (rec: Record<string, unknown>): string => {
    const code = toStr(pick(rec, ["currencyCode", "currency", "currencyId"]));
    return code ? code.toUpperCase() : "USD";
  };

  // Recursively collect any object that looks like a deal record (carries an
  // ASIN), regardless of how the response wraps its list. Bounded depth so a
  // pathological payload can never hang the page.
  const collect = (node: unknown, depth: number, out: DealItem[], seen: Set<string>): void => {
    if (!node || depth > 10) return;
    if (Array.isArray(node)) {
      for (const item of node) collect(item, depth + 1, out, seen);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      const asin = readAsin(obj);
      if (asin && !seen.has(asin)) {
        seen.add(asin);
        out.push({
          asin,
          imageUrl: readImage(obj),
          title: toStr(pick(obj, ["title", "name", "productTitle", "displayName"])),
          priceCents: readPriceCents(obj),
          currency: readCurrency(obj),
        });
      }
      for (const key of Object.keys(obj)) collect(obj[key], depth + 1, out, seen);
    }
  };

  // ASINs straight off a products-batch URL path, as image-less records. These
  // still let the overlay enrich (all its money lookups are ASIN-keyed); the
  // image join just falls back to DOM order for them.
  const fromProductsUrl = (url: string): DealItem[] => {
    const match = url.match(PRODUCTS_URL_RE);
    if (!match?.[1]) return [];
    const seen = new Set<string>();
    const out: DealItem[] = [];
    for (const raw of match[1].split(",")) {
      const asin = raw.trim().toUpperCase();
      if (ASIN_RE.test(asin) && !seen.has(asin)) {
        seen.add(asin);
        out.push({ asin, imageUrl: null, title: null, priceCents: null, currency: "USD" });
      }
    }
    return out;
  };

  const fromBody = (text: string): DealItem[] => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return [];
    }
    const out: DealItem[] = [];
    collect(json, 0, out, new Set<string>());
    return out;
  };

  const emit = (items: DealItem[]) => {
    if (!items.length) return;
    try {
      document.dispatchEvent(new CustomEvent("ib-ext-deals-feed", { detail: { items } }));
    } catch {
      // never let the shim surface an error on the page
    }
  };

  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const result = originalFetch.apply(this as typeof globalThis, args);
    try {
      const input = args[0];
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (PRODUCTS_URL_RE.test(url)) emit(fromProductsUrl(url));
      if (PRODUCTS_URL_RE.test(url) || GRAPHQL_URL_RE.test(url)) {
        result
          .then((response) => response.clone().text())
          .then((text) => emit(fromBody(text)))
          .catch(() => undefined);
      }
    } catch {
      // passthrough regardless
    }
    return result;
  };

  const openOriginal = XMLHttpRequest.prototype.open;
  const sendOriginal = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { __ibUrl?: string },
    ...args: Parameters<XMLHttpRequest["open"]>
  ) {
    this.__ibUrl = String(args[1] ?? "");
    return openOriginal.apply(this, args as unknown as Parameters<XMLHttpRequest["open"]>);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & { __ibUrl?: string },
    ...args: Parameters<XMLHttpRequest["send"]>
  ) {
    try {
      const url = this.__ibUrl ?? "";
      if (PRODUCTS_URL_RE.test(url)) emit(fromProductsUrl(url));
      if (PRODUCTS_URL_RE.test(url) || GRAPHQL_URL_RE.test(url)) {
        this.addEventListener("load", () => {
          try {
            const text = this.responseText;
            if (typeof text === "string") emit(fromBody(text));
          } catch {
            // responseType may not be text; ignore
          }
        });
      }
    } catch {
      // passthrough regardless
    }
    return sendOriginal.apply(this, args);
  };
})();
