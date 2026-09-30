import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Finding } from "./types";

// apiTransport.send groups a batch by type, posts each group to its endpoint,
// and reports {ok, retry}. The regression pinned here: a permanent 4xx (a
// revoked key, or an oversized/all-invalid group) must be NON-retryable, or the
// whole finding queue wedges behind one rejected type and never drains. Only a
// 5xx / 429 / network error is worth re-sending.

let syncEnabled = true;
let licenseKey: string | null = "LIC-123";
let contributeCatalogue = false;
const fetchMock = vi.fn();

vi.mock("../storage/store", () => ({
  getState: async () => ({
    settings: { syncEnabled, contributeCatalogue },
    auth: { licenseKey },
  }),
}));

import { apiTransport } from "./api-transport";

beforeEach(() => {
  syncEnabled = true;
  licenseKey = "LIC-123";
  contributeCatalogue = false;
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

const scan = (asin: string): Finding =>
  ({
    type: "product_scan",
    asin,
    marketplace: "amazon.com",
    scannedAt: "2026-09-29T00:00:00.000Z",
    counts: { brand: 1, influencer: 2, customer: 0, unknown: 0 },
    approved: false,
  }) as unknown as Finding;

const res = (status: number): Response => ({ ok: status >= 200 && status < 300, status }) as Response;

describe("apiTransport.send retry classification", () => {
  it("succeeds when every group is accepted", async () => {
    fetchMock.mockResolvedValue(res(200));
    expect(await apiTransport.send([scan("B000000001")])).toEqual({ ok: true, retry: false });
  });

  it("does NOT retry a permanent 400 (would wedge the queue forever)", async () => {
    fetchMock.mockResolvedValue(res(400));
    expect(await apiTransport.send([scan("B000000001")])).toEqual({ ok: false, retry: false });
  });

  it("does NOT retry a revoked key (401)", async () => {
    fetchMock.mockResolvedValue(res(401));
    expect(await apiTransport.send([scan("B000000001")])).toEqual({ ok: false, retry: false });
  });

  it("retries a transient 5xx", async () => {
    fetchMock.mockResolvedValue(res(503));
    expect(await apiTransport.send([scan("B000000001")])).toEqual({ ok: false, retry: true });
  });

  it("retries a 429 rate limit", async () => {
    fetchMock.mockResolvedValue(res(429));
    expect(await apiTransport.send([scan("B000000001")])).toEqual({ ok: false, retry: true });
  });

  it("retries a network error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await apiTransport.send([scan("B000000001")])).toEqual({ ok: false, retry: true });
  });

  it("reports success when a good group succeeds and a bad group permanently fails, so the batch can drop", async () => {
    // A scan group 200s while (hypothetically) another group 400s: any-succeeded
    // + no-transient means ok:true / retry:false, so flush drops the batch and
    // the healthy data is not re-sent forever.
    fetchMock.mockResolvedValueOnce(res(200)).mockResolvedValueOnce(res(400));
    const gap = { type: "content_gap", asin: "B000000002", marketplace: "amazon.com", gapType: "no_influencer", influencerVideoCount: 0, detectedAt: "2026-09-29T00:00:00.000Z" } as unknown as Finding;
    expect(await apiTransport.send([scan("B000000001"), gap])).toEqual({ ok: true, retry: false });
  });
});
