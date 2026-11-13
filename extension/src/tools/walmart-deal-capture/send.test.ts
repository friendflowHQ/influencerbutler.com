import { describe, expect, it } from "vitest";
import type { HudCommand } from "../../transport/hud-commands";
import type { WalmartEventProduct } from "../../walmart/deal-capture";
import { DEAL_CAPTURE_CATALOG } from "../../walmart/deal-capture-strings";
import { DEALS_CATALOG } from "../../deals/strings";
import { sendCapturedDeals, type CaptureReply, type CaptureStrings } from "./send";

const dict: CaptureStrings = {
  ...DEAL_CAPTURE_CATALOG.en,
  appNotRunning: DEALS_CATALOG.en.cardAppNotRunning,
  needsPairing: DEALS_CATALOG.en.cardNeedsPairing,
};

function products(n: number): WalmartEventProduct[] {
  return Array.from({ length: n }, (_, i) => ({
    itemId: String(100000 + i),
    title: `Item ${i}`,
    url: `https://www.walmart.com/ip/${100000 + i}`,
  }));
}

function recorder(replies: CaptureReply[]) {
  const sent: HudCommand[] = [];
  return {
    sent,
    send: async (command: HudCommand) => {
      sent.push(command);
      return replies.length > 1 ? (replies.shift() as CaptureReply) : (replies[0] as CaptureReply);
    },
  };
}

const PAGE = "https://www.walmart.com/shop/deals/black-friday";

describe("sendCapturedDeals", () => {
  it("sends the exact envelope, chunked at 200, and sums what the table added", async () => {
    const r = recorder([
      { ok: true, added: 150, total: 150, skipped: 50 },
      { ok: true, added: 30, total: 180, skipped: 20 },
    ]);
    const out = await sendCapturedDeals({ products: products(250), pageUrl: PAGE, workspace: "default", send: r.send, dict });
    expect(r.sent).toHaveLength(2);
    const first = r.sent[0] as Extract<HudCommand, { type: "walmartEvent.capture" }>;
    expect(first.type).toBe("walmartEvent.capture");
    expect(first.workspace).toBe("default");
    expect(first.pageUrl).toBe(PAGE);
    expect(first.products).toHaveLength(200);
    expect((r.sent[1] as typeof first).products).toHaveLength(50);
    expect(out).toEqual({ ok: true, message: "Sent 180 deals to your Black Friday Deals table. It now has 180 deals." });
  });

  it("omits workspace when none is configured", async () => {
    const r = recorder([{ ok: true, added: 1, total: 1 }]);
    await sendCapturedDeals({ products: products(1), pageUrl: PAGE, workspace: "  ", send: r.send, dict });
    expect("workspace" in (r.sent[0] as object)).toBe(false);
  });

  it("says so when every deal was already in the table", async () => {
    const r = recorder([{ ok: true, added: 0, total: 42 }]);
    const out = await sendCapturedDeals({ products: products(3), pageUrl: PAGE, send: r.send, dict });
    expect(out.message).toBe(dict.nothingNew(42));
  });

  it("does not send an empty page", async () => {
    const r = recorder([{ ok: true }]);
    const out = await sendCapturedDeals({ products: [], pageUrl: PAGE, send: r.send, dict });
    expect(r.sent).toHaveLength(0);
    expect(out).toEqual({ ok: false, message: dict.noProducts });
  });

  it("uses the chip wording when nothing answers or the app is not paired", async () => {
    expect((await sendCapturedDeals({ products: products(1), pageUrl: PAGE, send: recorder([null]).send, dict })).message).toBe(
      DEALS_CATALOG.en.cardAppNotRunning,
    );
    const notRunning = recorder([{ ok: false, message: "The Influencer Butler app is not running. Open it on this computer." }]);
    expect((await sendCapturedDeals({ products: products(1), pageUrl: PAGE, send: notRunning.send, dict })).message).toBe(
      DEALS_CATALOG.en.cardAppNotRunning,
    );
    const pairing = recorder([{ ok: false, needsPairing: true, message: "Reconnect it." }]);
    expect((await sendCapturedDeals({ products: products(1), pageUrl: PAGE, send: pairing.send, dict })).message).toBe(
      DEALS_CATALOG.en.cardNeedsPairing,
    );
  });

  it("asks for a desktop update when the app does not know the command", async () => {
    const r = recorder([{ ok: false, message: "Unknown command: walmartEvent.capture" }]);
    const out = await sendCapturedDeals({ products: products(1), pageUrl: PAGE, send: r.send, dict });
    expect(out).toEqual({ ok: false, message: dict.needsUpdate });
  });

  it("stops at a failed chunk and says how far it got", async () => {
    const r = recorder([{ ok: true, added: 200, total: 200 }, { ok: false, message: "Table is full." }]);
    const out = await sendCapturedDeals({ products: products(300), pageUrl: PAGE, send: r.send, dict });
    expect(out.ok).toBe(false);
    expect(out.message).toBe(`Table is full. ${dict.partial(200, 300)}`);
  });

  it("passes the relay's sentence through and notes a capped page", async () => {
    const r = recorder([{ ok: true, viaRemote: true, message: "Sent to Office PC. It will post from that computer." }]);
    const out = await sendCapturedDeals({ products: products(2), pageUrl: PAGE, send: r.send, dict, capped: true, capMax: 500 });
    expect(out.message).toBe(`Sent to Office PC. It will post from that computer. ${dict.capped(500)}`);
  });
});
