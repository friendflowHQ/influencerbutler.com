import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub chrome.runtime.sendMessage (what sendToBackground wraps). Each test sets
// `respond` to route a message by its `kind` to a canned reply.
let respond: (message: { kind: string; asins?: string[] }) => unknown = () => ({});
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: (message: { kind: string; asins?: string[] }) => Promise.resolve(respond(message)),
  },
});

import { resolveOwnership } from "./resolve";

const posted = (available: boolean) => ({
  available,
  count: available ? 1 : 0,
  platforms: available ? ["youtube"] : [],
  lastAt: null,
  items: [],
});

beforeEach(() => {
  respond = () => ({});
});

describe("resolveOwnership", () => {
  it("short-circuits an empty batch without any lookup", async () => {
    let called = false;
    respond = () => {
      called = true;
      return {};
    };
    expect(await resolveOwnership([])).toEqual([]);
    expect(called).toBe(false);
  });

  it("passes the paired bridge result through", async () => {
    respond = (m) => {
      expect(m.kind).toBe("LOOKUP_OWNERSHIP");
      return {
        ok: true,
        results: [{ asin: "B0OWNED0001", owned: true, posted: posted(true), reviewed: null }],
      };
    };
    const out = await resolveOwnership(["b0owned0001"]);
    expect(out).toHaveLength(1);
    expect(out[0].owned).toBe(true);
    expect(out[0].posted.available).toBe(true);
  });

  it("falls back to the server owned list when the app was never paired", async () => {
    respond = (m) => {
      if (m.kind === "LOOKUP_OWNERSHIP") return { ok: false, paired: false, results: [] };
      if (m.kind === "GET_ORDER_ASINS") {
        return { ok: true, items: [{ asin: "B0OWNED0001", marketplace: "amazon.com", title: "x" }] };
      }
      return {};
    };
    const out = await resolveOwnership(["B0OWNED0001", "B0NOTOWN001"]);
    expect(out.map((r) => r.asin)).toEqual(["B0OWNED0001"]);
    expect(out[0].owned).toBe(true);
    // The server fallback has no order detail or posted content.
    expect(out[0].order).toBeUndefined();
    expect(out[0].posted.available).toBe(false);
  });

  it("returns nothing on a failed unpaired fallback", async () => {
    respond = (m) => {
      if (m.kind === "LOOKUP_OWNERSHIP") return { ok: false, paired: false, results: [] };
      return { ok: false, items: [] };
    };
    expect(await resolveOwnership(["B0OWNED0001"])).toEqual([]);
  });

  it("returns nothing when the bridge lookup is not ok (and paired)", async () => {
    respond = () => ({ ok: false, results: [] });
    expect(await resolveOwnership(["B0OWNED0001"])).toEqual([]);
  });
});
