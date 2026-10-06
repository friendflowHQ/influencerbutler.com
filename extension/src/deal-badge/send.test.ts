import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSendQueue, chipStateFor, type ChipHandle } from "./send";
import type { HudCommand, HudCommandResult } from "../transport/hud-commands";
import { DEALS_CATALOG } from "../deals/strings";

// The chip's send path: coalescing a burst of clicks into one bridge frame,
// the compatibility downgrade for an app that predates deal.push.batch, and
// what each chip is told afterwards. The DOM chip itself is covered by the
// live smoke test; everything decided here is pure or injected.

const D = DEALS_CATALOG.en;

function fakeChip(): ChipHandle & { states: Array<[string, string | undefined]> } {
  const states: Array<[string, string | undefined]> = [];
  return { states, setState: (state, detail) => void states.push([state, detail]) };
}

function product(asin: string) {
  return { asin, marketplace: "amazon.com", url: `https://www.amazon.com/dp/${asin}` };
}

function queueWith(send: (command: HudCommand) => Promise<HudCommandResult | null>) {
  return createSendQueue({
    send,
    target: async () => ({ workspace: "deals", placement: "end" as const }),
    dict: D,
  });
}

describe("createSendQueue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("sends an event-day chip click to its own workspace and reports only that chip", async () => {
    const sent: HudCommand[] = [];
    const queue = queueWith(async (command) => {
      sent.push(command);
      return { ok: true } as HudCommandResult;
    });
    const main = fakeChip();
    const extra = fakeChip();
    queue.enqueue(product("B0000000X1"), extra, "prime-day");
    await vi.runAllTimersAsync();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: "deal.push", workspace: "prime-day" });
    expect(extra.states.at(-1)?.[0]).toBe("sent");
    expect(main.states).toEqual([]);
  });

  it("mirrors to the also-workspace quietly without touching chip state", async () => {
    const sent: HudCommand[] = [];
    const queue = createSendQueue({
      send: async (command) => {
        sent.push(command);
        // The mirror fails; the chip must still read as sent.
        return (command as { workspace: string }).workspace === "prime-day"
          ? ({ ok: false, message: "nope" } as HudCommandResult)
          : ({ ok: true } as HudCommandResult);
      },
      target: async () => ({ workspace: "deals", placement: "end" as const, alsoWorkspace: "prime-day" }),
      dict: D,
    });
    const chip = fakeChip();
    queue.enqueue(product("B0000000X2"), chip);
    await vi.runAllTimersAsync();
    expect(sent.map((c) => (c as { workspace: string }).workspace)).toEqual(["deals", "prime-day"]);
    expect(chip.states.at(-1)?.[0]).toBe("sent");
  });

  it("coalesces a burst of clicks into one batch", async () => {
    const sent: HudCommand[] = [];
    const send = vi.fn(async (command: HudCommand) => {
      sent.push(command);
      return { ok: true } as HudCommandResult;
    });
    const queue = queueWith(send);

    const chips = [fakeChip(), fakeChip(), fakeChip(), fakeChip()];
    chips.forEach((chip, i) => queue.enqueue(product(`B0000000A${i}`), chip));
    // Pending is immediate: the chip must not wait on the flush to react.
    for (const chip of chips) expect(chip.states[0]?.[0]).toBe("pending");

    await vi.runAllTimersAsync();

    expect(send).toHaveBeenCalledTimes(1);
    expect(sent[0]?.type).toBe("deal.push.batch");
    expect(sent[0]).toMatchObject({ workspace: "deals", placement: "end" });
    for (const chip of chips) expect(chip.states.at(-1)?.[0]).toBe("sent");
  });

  it("sends a lone click as a single push", async () => {
    const sent: HudCommand[] = [];
    const queue = queueWith(async (command) => {
      sent.push(command);
      return { ok: true } as HudCommandResult;
    });

    queue.enqueue(product("B0000000A1"), fakeChip());
    await vi.runAllTimersAsync();

    expect(sent[0]?.type).toBe("deal.push");
  });

  it("collapses a double click on one card into one product, telling both handles", async () => {
    const sent: HudCommand[] = [];
    const queue = queueWith(async (command) => {
      sent.push(command);
      return { ok: true } as HudCommandResult;
    });

    const first = fakeChip();
    const second = fakeChip();
    queue.enqueue(product("B0000000A1"), first);
    queue.enqueue(product("B0000000A1"), second);
    await vi.runAllTimersAsync();

    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("deal.push");
    expect(first.states.at(-1)?.[0]).toBe("sent");
    expect(second.states.at(-1)?.[0]).toBe("sent");
  });

  it("downgrades to single pushes when the app does not know the batch command, and latches", async () => {
    const sent: HudCommand[] = [];
    const queue = queueWith(async (command) => {
      sent.push(command);
      if (command.type === "deal.push.batch") {
        return { ok: false, message: "Unknown command: deal.push.batch" } as HudCommandResult;
      }
      return { ok: true } as HudCommandResult;
    });

    const chips = [fakeChip(), fakeChip()];
    chips.forEach((chip, i) => queue.enqueue(product(`B0000000A${i}`), chip));
    await vi.runAllTimersAsync();

    expect(sent.map((c) => c.type)).toEqual(["deal.push.batch", "deal.push", "deal.push"]);
    for (const chip of chips) expect(chip.states.at(-1)?.[0]).toBe("sent");

    // A later burst must not pay for the failed probe again.
    sent.length = 0;
    queue.enqueue(product("B0000000B0"), fakeChip());
    queue.enqueue(product("B0000000B1"), fakeChip());
    await vi.runAllTimersAsync();
    expect(sent.map((c) => c.type)).toEqual(["deal.push", "deal.push"]);
  });

  it("marks every queued chip errored when nothing answers", async () => {
    const queue = queueWith(async () => null);
    const chips = [fakeChip(), fakeChip()];
    chips.forEach((chip, i) => queue.enqueue(product(`B0000000A${i}`), chip));
    await vi.runAllTimersAsync();

    for (const chip of chips) {
      expect(chip.states.at(-1)).toEqual(["error", D.cardAppNotRunning]);
    }
  });
});

describe("chipStateFor", () => {
  it("separates a dead worker from an unpaired app from a refusal", () => {
    expect(chipStateFor(null, D)).toEqual({ state: "error", detail: D.cardAppNotRunning });
    expect(chipStateFor({ ok: false, needsPairing: true }, D)).toEqual({
      state: "error",
      detail: D.cardNeedsPairing,
    });
    expect(chipStateFor({ ok: false, message: "Workspace is full." }, D)).toEqual({
      state: "error",
      detail: "Workspace is full.",
    });
  });

  it("reports a send", () => {
    expect(chipStateFor({ ok: true }, D)).toEqual({ state: "sent" });
  });
});
