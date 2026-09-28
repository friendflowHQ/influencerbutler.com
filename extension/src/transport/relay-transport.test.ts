import { afterEach, describe, expect, it, vi } from "vitest";
import type { Finding } from "./types";

// The relay findings sink reads sync toggle + license key + default target from
// storage, asks the local transport whether a same-machine app is present, and
// hands the batch to relaySend. Mock all three so the gate + send logic can be
// exercised without chrome or the network.
let syncEnabled = true;
let licenseKey: string | null = "LIC-123";
let relayDefaultTarget: { instanceId: string; label: string | null } | null = {
  instanceId: "desk-1",
  label: "Laptop",
};
let localAvailable = false;
let sendResult: { ok: boolean; id?: string; error?: string } = { ok: true, id: "msg-1" };
const relaySendMock = vi.fn(async () => sendResult);

vi.mock("../storage/store", () => ({
  getState: async () => ({ settings: { syncEnabled, relayDefaultTarget }, auth: { licenseKey } }),
}));
vi.mock("./local-transport", () => ({
  localTransport: { id: "local", isAvailable: async () => localAvailable, send: async () => ({ ok: true, retry: false }) },
}));
vi.mock("../background/relay", () => ({
  relaySend: (...args: unknown[]) => relaySendMock(...(args as [])),
}));

import { relayTransport } from "./relay-transport";

afterEach(() => {
  syncEnabled = true;
  licenseKey = "LIC-123";
  relayDefaultTarget = { instanceId: "desk-1", label: "Laptop" };
  localAvailable = false;
  sendResult = { ok: true, id: "msg-1" };
  relaySendMock.mockClear();
});

const batch: Finding[] = [
  { type: "product_scan", asin: "B0016HF5GK", scannedAt: "2026-09-16T00:00:00.000Z" } as unknown as Finding,
];

describe("relayTransport.isAvailable", () => {
  it("is available when sync is on, signed in, a device is linked, and no local app is here", async () => {
    expect(await relayTransport.isAvailable()).toBe(true);
  });

  it("is unavailable when the master sync toggle is off", async () => {
    syncEnabled = false;
    expect(await relayTransport.isAvailable()).toBe(false);
  });

  it("is unavailable when not signed in", async () => {
    licenseKey = null;
    expect(await relayTransport.isAvailable()).toBe(false);
  });

  it("is unavailable when no device is linked as the default target", async () => {
    relayDefaultTarget = null;
    expect(await relayTransport.isAvailable()).toBe(false);
  });

  it("suppresses itself when a local app is present, to avoid double-feeding", async () => {
    localAvailable = true;
    expect(await relayTransport.isAvailable()).toBe(false);
  });
});

describe("relayTransport.send", () => {
  it("relays the batch as a findings.push.batch command to the default target", async () => {
    const res = await relayTransport.send(batch);
    expect(res).toEqual({ ok: true, retry: false });
    expect(relaySendMock).toHaveBeenCalledWith(
      { type: "findings.push.batch", findings: batch },
      "desk-1",
    );
  });

  it("drops (does not wedge) when the default target vanished before send", async () => {
    relayDefaultTarget = null;
    const res = await relayTransport.send(batch);
    expect(res).toEqual({ ok: true, retry: false });
    expect(relaySendMock).not.toHaveBeenCalled();
  });

  it("keeps the batch for a transient reach failure", async () => {
    sendResult = { ok: false, error: "network" };
    const res = await relayTransport.send(batch);
    expect(res).toEqual({ ok: false, retry: true });
  });

  it("drops the batch on a definitive rejection (not linked / needs paid plan)", async () => {
    sendResult = { ok: false, error: "This extension is not linked to that computer yet." };
    const res = await relayTransport.send(batch);
    expect(res).toEqual({ ok: false, retry: false });
  });
});
