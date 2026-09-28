import { afterEach, describe, expect, it, vi } from "vitest";
import type { HudCommand } from "../transport/hud-commands";

// The relay sender reads the signed-in license key + the default target from
// storage, the stable client id from the bridge, and (for the smart send) the
// local bridge sender; mock all so the fetch layer can be exercised without
// chrome. The Worker side is tested in the desktop repo.
let licenseKey: string | null = "LIC-123";
let relayDefaultTarget: { instanceId: string; label: string | null } | null = null;
let localResult: { ok: boolean; message?: string; needsPairing?: boolean } = { ok: true, message: "Added." };

vi.mock("../storage/store", () => ({
  getState: async () => ({ auth: { licenseKey } }),
  getSettings: async () => ({ relayDefaultTarget }),
}));
vi.mock("./hud-bridge", () => ({
  getClientId: async () => "sender-uuid-1",
  sendHudCommand: async () => localResult,
}));

import {
  relayClaimLink,
  relayListTargets,
  relaySend,
  resolveDefaultRelayTarget,
  sendCommandPreferLocal,
} from "./relay";

afterEach(() => {
  vi.unstubAllGlobals();
  licenseKey = "LIC-123";
  relayDefaultTarget = null;
  localResult = { ok: true, message: "Added." };
});

const dealCmd: HudCommand = { type: "deal.push", workspace: "default", product: { asin: "B0", marketplace: "amazon.com" } };
const walmartDealCmd: HudCommand = {
  type: "deal.push.batch",
  workspace: "default",
  products: [{ asin: "123456789", marketplace: "walmart.com", url: "https://www.walmart.com/ip/123456789" }],
};

describe("relaySend", () => {
  it("posts the command with the license Bearer + sender id and returns the queued id", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ ok: true, id: "msg-1" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await relaySend(
      { type: "deal.push.batch", workspace: "default", products: [] },
      "desk-1",
    );
    expect(res).toEqual({ ok: true, id: "msg-1" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://licensing.influencerbutler.com/relay/send");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer LIC-123");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ senderId: "sender-uuid-1", targetInstanceId: "desk-1" });
    expect(body.command.type).toBe("deal.push.batch");
  });

  it("maps the not-linked error to a friendly message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "not_linked" }), { status: 200 }),
    ));
    const res = await relaySend({ type: "deal.push", workspace: "default", product: { asin: "B0", marketplace: "amazon.com" } }, "desk-1");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/not linked/i);
  });

  it("refuses when no license key is signed in", async () => {
    licenseKey = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await relaySend({ type: "deal.push", workspace: "default", product: { asin: "B0", marketplace: "amazon.com" } }, "desk-1");
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("relayClaimLink", () => {
  it("rejects a non-6-digit code before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await relayClaimLink("12ab");
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("claims a valid code and returns the receiver", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, receiverInstanceId: "desk-1", receiverLabel: "Studio PC" }), { status: 200 }),
    ));
    const res = await relayClaimLink("123456", "Laptop");
    expect(res).toEqual({ ok: true, receiverInstanceId: "desk-1", receiverLabel: "Studio PC" });
  });

  it("maps invalid_code to a friendly message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: false, error: "invalid_code" }), { status: 200 }),
    ));
    const res = await relayClaimLink("123456");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/wrong or has expired/i);
  });
});

describe("relayListTargets", () => {
  it("returns the linked targets", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ ok: true, targets: [{ receiverInstanceId: "desk-1", receiverLabel: "Studio PC" }] }), { status: 200 }),
    ));
    const res = await relayListTargets();
    expect(res.ok).toBe(true);
    expect(res.targets).toEqual([{ receiverInstanceId: "desk-1", receiverLabel: "Studio PC" }]);
  });

  it("reports not-signed-in without a network call when no key", async () => {
    licenseKey = null;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await relayListTargets();
    expect(res).toEqual({ ok: false, targets: [], error: "not-signed-in" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// Stub /relay/targets so resolveDefaultRelayTarget can see linked devices.
function stubTargets(targets: Array<{ receiverInstanceId: string; receiverLabel: string | null }>): void {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (String(url).includes("/relay/targets")) {
      return new Response(JSON.stringify({ ok: true, targets }), { status: 200 });
    }
    // Any other call (i.e. /relay/send) succeeds with a queued id.
    return new Response(JSON.stringify({ ok: true, id: "msg-1" }), { status: 200 });
  }));
}

describe("resolveDefaultRelayTarget", () => {
  it("uses the sole linked device when there is exactly one and no saved default", async () => {
    stubTargets([{ receiverInstanceId: "desk-1", receiverLabel: "Studio PC" }]);
    expect(await resolveDefaultRelayTarget()).toEqual({ instanceId: "desk-1", label: "Studio PC" });
  });

  it("returns null when several are linked and no default was chosen", async () => {
    stubTargets([
      { receiverInstanceId: "desk-1", receiverLabel: "Studio PC" },
      { receiverInstanceId: "desk-2", receiverLabel: "Laptop" },
    ]);
    expect(await resolveDefaultRelayTarget()).toBeNull();
  });

  it("honors a saved default that is still linked", async () => {
    relayDefaultTarget = { instanceId: "desk-2", label: "Laptop" };
    stubTargets([
      { receiverInstanceId: "desk-1", receiverLabel: "Studio PC" },
      { receiverInstanceId: "desk-2", receiverLabel: "Laptop" },
    ]);
    expect(await resolveDefaultRelayTarget()).toEqual({ instanceId: "desk-2", label: "Laptop" });
  });

  it("drops a saved default that is no longer linked", async () => {
    relayDefaultTarget = { instanceId: "gone", label: "Old PC" };
    stubTargets([{ receiverInstanceId: "desk-1", receiverLabel: "Studio PC" }]);
    // Falls back to the sole remaining device rather than the stale default.
    expect(await resolveDefaultRelayTarget()).toEqual({ instanceId: "desk-1", label: "Studio PC" });
  });
});

describe("sendCommandPreferLocal", () => {
  it("returns the local result unchanged when the local app handled it", async () => {
    localResult = { ok: true, message: "Added to Deals Butler." };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendCommandPreferLocal(dealCmd);
    expect(res).toEqual({ ok: true, message: "Added to Deals Butler." });
    expect(fetchMock).not.toHaveBeenCalled(); // never touched the relay
  });

  it("relays an Amazon deal to the other computer when no local app is running", async () => {
    localResult = { ok: false, message: "The Influencer Butler app is not running." };
    stubTargets([{ receiverInstanceId: "desk-1", receiverLabel: "Studio PC" }]);
    const res = await sendCommandPreferLocal(dealCmd);
    expect(res.ok).toBe(true);
    expect(res.viaRemote).toBe(true);
    expect(res.message).toMatch(/Studio PC/);
  });

  it("relays a Walmart deal batch the same way (retailer-neutral)", async () => {
    localResult = { ok: false, message: "The Influencer Butler app is not running." };
    stubTargets([{ receiverInstanceId: "desk-1", receiverLabel: "Studio PC" }]);
    const res = await sendCommandPreferLocal(walmartDealCmd);
    expect(res.ok).toBe(true);
    expect(res.viaRemote).toBe(true);
  });

  it("does NOT relay a non-deal command (e.g. campaign.accept) even when local is down", async () => {
    localResult = { ok: false, message: "The Influencer Butler app is not running." };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendCommandPreferLocal({ type: "campaign.accept", kind: "cc", product: { asin: "B0", marketplace: "amazon.com" } });
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does NOT relay when the local app is present but unpaired (needsPairing)", async () => {
    localResult = { ok: false, needsPairing: true, message: "Reconnect the extension to the app." };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendCommandPreferLocal(dealCmd);
    expect(res.ok).toBe(false);
    expect(res.needsPairing).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps the local result when nothing is linked to fall back to", async () => {
    localResult = { ok: false, message: "The Influencer Butler app is not running." };
    stubTargets([]); // no linked devices
    const res = await sendCommandPreferLocal(dealCmd);
    expect(res.ok).toBe(false);
    expect(res.viaRemote).toBeUndefined();
  });
});
