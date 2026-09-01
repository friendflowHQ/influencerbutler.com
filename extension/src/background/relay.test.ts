import { afterEach, describe, expect, it, vi } from "vitest";

// The relay sender reads the signed-in license key from storage and the stable
// client id from the bridge; mock both so the fetch layer can be exercised
// without chrome. The Worker side is tested in the desktop repo.
let licenseKey: string | null = "LIC-123";

vi.mock("../storage/store", () => ({
  getState: async () => ({ auth: { licenseKey } }),
}));
vi.mock("./hud-bridge", () => ({
  getClientId: async () => "sender-uuid-1",
}));

import { relayClaimLink, relayListTargets, relaySend } from "./relay";

afterEach(() => {
  vi.unstubAllGlobals();
  licenseKey = "LIC-123";
});

describe("relaySend", () => {
  it("posts the command with the license Bearer + sender id and returns the queued id", async () => {
    const fetchMock = vi.fn(async () =>
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
