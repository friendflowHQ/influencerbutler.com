import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal chrome.storage.local stub over a plain object (same shape as
// product-lists.test.ts): store.ts calls get(KEY) and set({ [KEY]: state }).
let store: Record<string, unknown> = {};
const localStub = {
  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null) return { ...store };
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of list) if (k in store) out[k] = store[k];
    return out;
  },
  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(store, items);
  },
};
vi.stubGlobal("chrome", { storage: { local: localStub } });

import { captureAffiliateReferral } from "./affiliate";
import { getState } from "../storage/store";

beforeEach(() => {
  store = {};
});

describe("captureAffiliateReferral", () => {
  it("stores a captured code, upper-cased, with a source", async () => {
    await captureAffiliateReferral("kay", "cookie");
    const { affiliate } = await getState();
    expect(affiliate?.code).toBe("KAY");
    expect(affiliate?.source).toBe("cookie");
    expect(typeof affiliate?.capturedAt).toBe("number");
  });

  it("is first-touch: never overwrites an earlier code", async () => {
    await captureAffiliateReferral("first", "param");
    await captureAffiliateReferral("second", "cookie");
    const { affiliate } = await getState();
    expect(affiliate?.code).toBe("FIRST");
    expect(affiliate?.source).toBe("param");
  });

  it("rejects a junk code and leaves storage untouched", async () => {
    await captureAffiliateReferral("not a real code!!", "cookie");
    await captureAffiliateReferral("", "cookie");
    const { affiliate } = await getState();
    expect(affiliate).toBeNull();
  });
});
