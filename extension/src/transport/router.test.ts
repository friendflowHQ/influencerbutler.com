import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Finding } from "./types";

// flush() dual-sends a batch to every available sink, then decides whether to
// drop it from the queue. The regression these tests pin: a best-effort sink
// (the local HUD bridge) that keeps asking to retry must NOT hold the queue, or
// findings never reach the durable website dashboard even though that sync is
// meant to be app-independent.

type Result = { ok: boolean; retry: boolean };

let apiAvailable = true;
let apiResult: Result = { ok: true, retry: false };
let localAvailable = false;
let localResult: Result = { ok: false, retry: true };
let relayAvailable = false;
let relayResult: Result = { ok: false, retry: false };

const state: { queue: Finding[]; lastSyncAt: number | null } = { queue: [], lastSyncAt: null };

vi.mock("../storage/store", () => ({
  getState: async () => state,
  patchState: async (fn: (s: typeof state) => void) => {
    fn(state);
    return state;
  },
}));
vi.mock("./api-transport", () => ({
  apiTransport: {
    id: "api",
    isAvailable: async () => apiAvailable,
    send: async () => apiResult,
  },
}));
vi.mock("./local-transport", () => ({
  localTransport: {
    id: "local",
    bestEffort: true,
    isAvailable: async () => localAvailable,
    send: async () => localResult,
  },
}));
vi.mock("./relay-transport", () => ({
  relayTransport: {
    id: "relay",
    isAvailable: async () => relayAvailable,
    send: async () => relayResult,
  },
}));

import { flush } from "./router";

const mkBatch = (n: number): Finding[] =>
  Array.from({ length: n }, (_, i) => ({
    type: "product_scan",
    asin: `B00000000${i}`,
    marketplace: "amazon.com",
    scannedAt: "2026-09-29T00:00:00.000Z",
    counts: { brand: 0, influencer: 0, customer: 0, unknown: 0 },
  })) as unknown as Finding[];

beforeEach(() => {
  state.queue = mkBatch(3);
  state.lastSyncAt = null;
  apiAvailable = true;
  apiResult = { ok: true, retry: false };
  localAvailable = false;
  localResult = { ok: false, retry: true };
  relayAvailable = false;
  relayResult = { ok: false, retry: false };
});

afterEach(() => vi.clearAllMocks());

describe("flush drain decision", () => {
  it("drains once the durable API sink accepts, even while the local HUD bridge keeps asking to retry", async () => {
    apiAvailable = true;
    apiResult = { ok: true, retry: false };
    localAvailable = true;
    localResult = { ok: false, retry: true }; // busy app, wants a retry

    await flush();

    expect(state.queue).toHaveLength(0); // the bug: this used to stay at 3 forever
    expect(state.lastSyncAt).not.toBeNull();
  });

  it("holds the batch when a durable sink wants a retry (transient server/network)", async () => {
    apiAvailable = true;
    apiResult = { ok: false, retry: true };

    await flush();

    expect(state.queue).toHaveLength(3);
  });

  it("drops the batch when the durable sink permanently rejects it (no wedge)", async () => {
    apiAvailable = true;
    apiResult = { ok: false, retry: false }; // e.g. a 4xx: retrying can't help

    await flush();

    expect(state.queue).toHaveLength(0);
  });

  it("keeps the queue when no sink is available", async () => {
    apiAvailable = false;
    localAvailable = false;
    relayAvailable = false;

    await flush();

    expect(state.queue).toHaveLength(3);
  });

  it("falls back to the best-effort sink when it is the only one up: drains once it delivers", async () => {
    apiAvailable = false;
    relayAvailable = false;
    localAvailable = true;
    localResult = { ok: true, retry: false };

    await flush();

    expect(state.queue).toHaveLength(0);
  });

  it("keeps the queue when only the best-effort sink is up and it fails", async () => {
    apiAvailable = false;
    relayAvailable = false;
    localAvailable = true;
    localResult = { ok: false, retry: true };

    await flush();

    expect(state.queue).toHaveLength(3);
  });
});
