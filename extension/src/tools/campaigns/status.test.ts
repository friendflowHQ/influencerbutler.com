import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub chrome.runtime.sendMessage (what sendToBackground wraps). Each test sets
// `respond` to route a message by its `kind` to a canned reply.
let respond: (message: { kind: string; asins?: string[] }) => unknown = () => ({});
vi.stubGlobal("chrome", {
  runtime: {
    sendMessage: (message: { kind: string; asins?: string[] }) => Promise.resolve(respond(message)),
  },
});

import { resolveCampaignStatus } from "./status";

beforeEach(() => {
  respond = () => ({});
});

describe("resolveCampaignStatus", () => {
  it("short-circuits an empty batch without any lookup", async () => {
    let called = false;
    respond = () => {
      called = true;
      return {};
    };
    expect(await resolveCampaignStatus([])).toEqual([]);
    expect(called).toBe(false);
  });

  it("normalizes/dedupes ASINs and passes the enrolled result through", async () => {
    respond = (m) => {
      expect(m.kind).toBe("LOOKUP_CAMPAIGN_STATUS");
      expect(m.asins).toEqual(["B0ENROLLED1"]); // uppercased + deduped
      return {
        ok: true,
        results: [
          {
            asin: "B0ENROLLED1",
            cc: true,
            spcc: false,
            ratePct: 20,
            epc: 0.84,
            brand: "Acme",
            acceptedAt: "2026-08-01T00:00:00Z",
          },
        ],
      };
    };
    const out = await resolveCampaignStatus(["b0enrolled1", "B0ENROLLED1"]);
    expect(out).toHaveLength(1);
    expect(out[0]?.cc).toBe(true);
    expect(out[0]?.ratePct).toBe(20);
    expect(out[0]?.epc).toBe(0.84);
  });

  it("returns nothing when unpaired (no server fallback, unlike ownership)", async () => {
    let calls = 0;
    respond = (m) => {
      calls += 1;
      expect(m.kind).toBe("LOOKUP_CAMPAIGN_STATUS");
      return { ok: false, paired: false, results: [] };
    };
    expect(await resolveCampaignStatus(["B0ENROLLED1"])).toEqual([]);
    // Exactly one lookup: it must not fall back to a second (order-list) message.
    expect(calls).toBe(1);
  });

  it("returns nothing when the bridge lookup is not ok", async () => {
    respond = () => ({ ok: false, results: [] });
    expect(await resolveCampaignStatus(["B0ENROLLED1"])).toEqual([]);
  });

  it("returns nothing when sendToBackground throws", async () => {
    respond = () => {
      throw new Error("bridge down");
    };
    expect(await resolveCampaignStatus(["B0ENROLLED1"])).toEqual([]);
  });
});
