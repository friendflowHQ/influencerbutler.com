// MAIN-world hook, injected at document_start on the Creator Connections host
// (affiliate-program.amazon.com/p/connect/*).
//
// The campaign grid renders only commission / budget / dates on each card, but
// the underlying list JSON carries how full each campaign is: how many creator
// slots have been claimed vs. the cap, plus a "fully claimed" flag. That data
// never reaches the DOM, and the isolated-world content script cannot read the
// page's fetch responses or React state. So this shim wraps fetch/XHR as a pure
// passthrough and, when a campaign/search (or spcc/search) response goes by,
// republishes a compact { campaignId -> fill } map to the content script via a
// DOM CustomEvent. Nothing is modified, blocked, or sent anywhere: it only
// listens. This is the "Last Call Butler" data source.
//
// Verified live 2026-08-13 (littleprettyl-20): the Affiliate+ tab fetches
// POST /connect/api/campaign/search and the SPCC tab POST /connect/api/spcc/search;
// each campaign object holds numberOfCreatorsAccepted, numberOfCreatorsRequired,
// and fullyClaimed. See docs / memory "CC campaign fill API".

// Conversion stats a campaign record MIGHT carry (orders / sales / ROAS). These
// are the "proof shoppers are buying" numbers a competitor leans on. Unverified:
// we do not know Amazon actually exposes them on this record, so every field is
// nullable and the Campaign Butler brief is estimator-first (it falls back to our
// own catalogue demand). Best-effort capture from the same record we already
// walk for fill, so it costs nothing extra when the fields are absent.
type CampaignStats = {
  ordersLast30: number | null;
  salesLast30Cents: number | null;
  roas: number | null;
  ordersTotal: number | null;
  // Clicks, so a conversion rate (orders / clicks) can be computed downstream.
  // Same best-effort/unverified status as the rest: usually null.
  clicksLast30: number | null;
  clicksTotal: number | null;
};

type Fill = {
  accepted: number | null;
  required: number | null;
  fullyClaimed: boolean | null;
  stats: CampaignStats | null;
};

(() => {
  const w = window as typeof window & { __ibConnectHooked?: boolean };
  if (w.__ibConnectHooked) return;
  w.__ibConnectHooked = true;

  const URL_RE = /\/connect\/api\/(?:campaign|spcc)\/search/i;

  // Recursively collect any object that looks like a campaign record (carries a
  // campaignId), regardless of how the response wraps its list. Bounded depth so
  // a pathological payload can never hang the page.
  const collect = (node: unknown, depth: number, out: Record<string, unknown>[]): void => {
    if (!node || depth > 8) return;
    if (Array.isArray(node)) {
      for (const item of node) collect(item, depth + 1, out);
      return;
    }
    if (typeof node === "object") {
      const obj = node as Record<string, unknown>;
      if (typeof obj.campaignId === "string") out.push(obj);
      for (const key of Object.keys(obj)) collect(obj[key], depth + 1, out);
    }
  };

  const toNum = (v: unknown): number | null => (typeof v === "number" && isFinite(v) ? v : null);

  // Best-effort read of the first present numeric field among candidate key
  // names, on the record or a nested performance/stats/metrics object. The exact
  // Creator Connections field names for conversion are unverified, so we probe a
  // handful; a miss simply leaves the stat null (estimator-first fallback).
  const nested = (rec: Record<string, unknown>): Record<string, unknown>[] => {
    const out = [rec];
    for (const k of ["performance", "stats", "metrics", "campaignStats", "summary"]) {
      const v = rec[k];
      if (v && typeof v === "object") out.push(v as Record<string, unknown>);
    }
    return out;
  };
  const pickNum = (rec: Record<string, unknown>, keys: string[]): number | null => {
    for (const obj of nested(rec)) {
      for (const k of keys) {
        const n = toNum(obj[k]);
        if (n !== null) return n;
      }
    }
    return null;
  };
  const readStats = (rec: Record<string, unknown>): CampaignStats | null => {
    const ordersLast30 = pickNum(rec, ["ordersLast30Days", "ordersLast30", "recentOrders", "orders30d"]);
    const salesDollars = pickNum(rec, ["salesLast30Days", "salesLast30", "recentSales", "salesAmount", "revenueLast30"]);
    const roas = pickNum(rec, ["roas", "returnOnAdSpend", "roasLast30"]);
    const ordersTotal = pickNum(rec, ["totalOrders", "ordersTotal", "lifetimeOrders", "numberOfOrders"]);
    const clicksLast30 = pickNum(rec, ["clicksLast30Days", "clicksLast30", "recentClicks", "clicks30d"]);
    const clicksTotal = pickNum(rec, ["totalClicks", "clicksTotal", "lifetimeClicks", "numberOfClicks"]);
    const salesLast30Cents = salesDollars === null ? null : Math.round(salesDollars * 100);
    if (
      ordersLast30 === null &&
      salesLast30Cents === null &&
      roas === null &&
      ordersTotal === null &&
      clicksLast30 === null &&
      clicksTotal === null
    ) {
      return null;
    }
    return { ordersLast30, salesLast30Cents, roas, ordersTotal, clicksLast30, clicksTotal };
  };

  const buildMap = (records: Record<string, unknown>[]): Record<string, Fill> | null => {
    if (!records.length) return null;
    const map: Record<string, Fill> = {};
    for (const rec of records) {
      const id = rec.campaignId as string;
      const accepted = toNum(rec.numberOfCreatorsAccepted);
      const required = toNum(rec.numberOfCreatorsRequired);
      const fullyClaimed = typeof rec.fullyClaimed === "boolean" ? rec.fullyClaimed : null;
      const stats = readStats(rec);
      // Only publish records that actually carry fill or conversion data.
      if (accepted === null && required === null && fullyClaimed === null && stats === null) continue;
      map[id] = { accepted, required, fullyClaimed, stats };
    }
    return Object.keys(map).length ? map : null;
  };

  // Brand-level facts for the Messages drawer's brand index (tools/cc-messages):
  // the drawer thinks in brand names while this API is keyed by campaign id. The
  // field names below are UNVERIFIED probes (the fill fields above were verified
  // live, these were not), so every one is best-effort and a record is published
  // only when a brand AND a rate or end date resolved. The drawer treats the
  // rendered grid cards as the source of truth on any conflict.
  const pickStr = (rec: Record<string, unknown>, keys: string[]): string | null => {
    for (const k of keys) {
      const v = rec[k];
      if (typeof v === "string" && v.trim()) return v.trim();
      if (v && typeof v === "object") {
        const o = v as Record<string, unknown>;
        const name = o.name ?? o.displayName;
        if (typeof name === "string" && name.trim()) return name.trim();
      }
    }
    return null;
  };
  const pickRatePct = (rec: Record<string, unknown>): number | null => {
    const raw = pickNum(rec, [
      "commissionRate",
      "commissionRatePercent",
      "commissionRatePercentage",
      "commissionPercentage",
      "commissionPercent",
    ]);
    if (raw === null || raw <= 0) return null;
    // Some payloads carry a fraction (0.12), others a percent (12).
    return raw <= 1 ? Math.round(raw * 1000) / 10 : raw;
  };
  const toMs = (v: unknown): number | null => {
    if (typeof v === "number" && isFinite(v) && v > 0) return v > 1e11 ? v : v * 1000;
    if (typeof v === "string" && v.trim()) {
      const ms = Date.parse(v);
      return isFinite(ms) ? ms : null;
    }
    return null;
  };
  const pickEndsAt = (rec: Record<string, unknown>): number | null => {
    for (const k of ["endDate", "endDateTime", "endTime", "campaignEndDate", "endsAt", "expiryDate"]) {
      const ms = toMs(rec[k]);
      if (ms !== null) return ms;
    }
    return null;
  };

  type BrandRecord = {
    campaignId: string;
    brand: string;
    ratePct: number | null;
    endsAt: number | null;
  };
  const buildBrandRecords = (records: Record<string, unknown>[]): BrandRecord[] => {
    const out: BrandRecord[] = [];
    for (const rec of records) {
      const brand = pickStr(rec, ["brandName", "brand", "advertiserName", "merchantName", "sellerName"]);
      if (!brand) continue;
      const ratePct = pickRatePct(rec);
      const endsAt = pickEndsAt(rec);
      if (ratePct === null && endsAt === null) continue;
      out.push({ campaignId: rec.campaignId as string, brand, ratePct, endsAt });
    }
    return out;
  };

  const emitBrandRecords = (brands: BrandRecord[]) => {
    try {
      document.dispatchEvent(new CustomEvent("ib-ext-campaign-records", { detail: { records: brands } }));
    } catch {
      // never let the shim surface an error on the page
    }
  };

  // Parse one campaign/search body once and publish both the fill map and the
  // brand records.
  const handleBody = (text: string) => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return;
    }
    const records: Record<string, unknown>[] = [];
    collect(json, 0, records);
    const map = buildMap(records);
    if (map) emit(map);
    const brands = buildBrandRecords(records);
    if (brands.length) emitBrandRecords(brands);
  };

  const emit = (map: Record<string, Fill>) => {
    try {
      document.dispatchEvent(new CustomEvent("ib-ext-campaign-fill", { detail: { fills: map } }));
    } catch {
      // never let the shim surface an error on the page
    }
  };

  // Session facts the Messages inbox harvest needs (tools/cc-messages/inbox-api):
  // Amazon's /connect/api/chat/* calls 401 without the storefront-scoped `storeid`
  // request header its own app sends, and the thread endpoint wants the creator's
  // `actorId`. Both ride on the page's own requests, so lift them as they go by:
  // `storeid` from any /connect/api/* request, `actorId` from a chat/messages/list
  // URL. Published only when a value is new. Read-only; nothing is sent anywhere.
  const API_RE = /\/connect\/api\//i;
  const THREAD_RE = /\/connect\/api\/chat\/messages\/list/i;
  let seenStoreId = "";
  let seenActorId = "";
  const publishSession = () => {
    try {
      document.dispatchEvent(
        new CustomEvent("ib-ext-cc-session", { detail: { storeId: seenStoreId, actorId: seenActorId } }),
      );
    } catch {
      // never let the shim surface an error on the page
    }
  };
  const noteSession = (url: string, storeId: string | null) => {
    let changed = false;
    if (storeId && storeId !== seenStoreId) {
      seenStoreId = storeId;
      changed = true;
    }
    if (THREAD_RE.test(url)) {
      const m = /[?&]actorId=([^&]+)/.exec(url);
      let actor = "";
      try {
        actor = m ? decodeURIComponent(m[1] ?? "") : "";
      } catch {
        actor = "";
      }
      if (actor && actor !== seenActorId) {
        seenActorId = actor;
        changed = true;
      }
    }
    if (changed) publishSession();
  };
  const headerFrom = (headers: unknown, name: string): string | null => {
    try {
      if (!headers) return null;
      if (typeof Headers !== "undefined" && headers instanceof Headers) return headers.get(name);
      if (Array.isArray(headers)) {
        for (const pair of headers as unknown[]) {
          if (Array.isArray(pair) && String(pair[0]).toLowerCase() === name) return String(pair[1] ?? "");
        }
        return null;
      }
      if (typeof headers === "object") {
        for (const key of Object.keys(headers as Record<string, unknown>)) {
          if (key.toLowerCase() === name) return String((headers as Record<string, unknown>)[key] ?? "");
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const originalFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const result = originalFetch.apply(this as typeof globalThis, args);
    try {
      const input = args[0];
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      if (API_RE.test(url)) {
        const fromInit = headerFrom(args[1]?.headers, "storeid");
        const fromRequest = input instanceof Request ? input.headers.get("storeid") : null;
        noteSession(url, (fromInit || fromRequest || "").trim() || null);
      }
      if (URL_RE.test(url)) {
        result
          .then((response) => response.clone().text())
          .then((text) => handleBody(text))
          .catch(() => undefined);
      }
    } catch {
      // passthrough regardless
    }
    return result;
  };

  const openOriginal = XMLHttpRequest.prototype.open;
  const sendOriginal = XMLHttpRequest.prototype.send;
  const setHeaderOriginal = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest & { __ibUrl?: string },
    ...args: Parameters<XMLHttpRequest["open"]>
  ) {
    this.__ibUrl = String(args[1] ?? "");
    try {
      if (API_RE.test(this.__ibUrl)) noteSession(this.__ibUrl, null);
    } catch {
      // passthrough regardless
    }
    return openOriginal.apply(this, args as unknown as Parameters<XMLHttpRequest["open"]>);
  } as typeof XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.setRequestHeader = function (
    this: XMLHttpRequest & { __ibUrl?: string },
    name: string,
    value: string,
  ) {
    try {
      if (String(name).toLowerCase() === "storeid" && API_RE.test(this.__ibUrl ?? "")) {
        noteSession(this.__ibUrl ?? "", String(value).trim() || null);
      }
    } catch {
      // passthrough regardless
    }
    return setHeaderOriginal.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (
    this: XMLHttpRequest & { __ibUrl?: string },
    ...args: Parameters<XMLHttpRequest["send"]>
  ) {
    try {
      if (URL_RE.test(this.__ibUrl ?? "")) {
        this.addEventListener("load", () => {
          try {
            const text = this.responseText;
            if (typeof text === "string") handleBody(text);
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
