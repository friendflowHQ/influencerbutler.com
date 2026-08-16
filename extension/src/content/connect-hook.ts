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

type Fill = {
  accepted: number | null;
  required: number | null;
  fullyClaimed: boolean | null;
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

  const buildMap = (text: string): Record<string, Fill> | null => {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return null;
    }
    const records: Record<string, unknown>[] = [];
    collect(json, 0, records);
    if (!records.length) return null;
    const map: Record<string, Fill> = {};
    for (const rec of records) {
      const id = rec.campaignId as string;
      const accepted = toNum(rec.numberOfCreatorsAccepted);
      const required = toNum(rec.numberOfCreatorsRequired);
      const fullyClaimed = typeof rec.fullyClaimed === "boolean" ? rec.fullyClaimed : null;
      // Only publish records that actually carry fill data.
      if (accepted === null && required === null && fullyClaimed === null) continue;
      map[id] = { accepted, required, fullyClaimed };
    }
    return Object.keys(map).length ? map : null;
  };

  const emit = (map: Record<string, Fill>) => {
    try {
      document.dispatchEvent(new CustomEvent("ib-ext-campaign-fill", { detail: { fills: map } }));
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
      if (URL_RE.test(url)) {
        result
          .then((response) => response.clone().text())
          .then((text) => {
            const map = buildMap(text);
            if (map) emit(map);
          })
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
      if (URL_RE.test(this.__ibUrl ?? "")) {
        this.addEventListener("load", () => {
          try {
            const text = this.responseText;
            if (typeof text === "string") {
              const map = buildMap(text);
              if (map) emit(map);
            }
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
