import { afterEach, describe, expect, it, vi } from "vitest";
import { askBackground } from "./messages";
import type { RuntimeMessage } from "./messages";

const PING: RuntimeMessage = { kind: "GET_PRODUCT_LISTS" };

function mockSendMessage(impl: () => unknown): void {
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage: impl },
  };
}

afterEach(() => {
  delete (globalThis as { chrome?: unknown }).chrome;
  vi.useRealTimers();
});

describe("askBackground", () => {
  it("passes a reply through, false included", async () => {
    mockSendMessage(() => Promise.resolve({ lists: [] }));
    await expect(askBackground(PING)).resolves.toEqual({ lists: [] });
    mockSendMessage(() => Promise.resolve(false));
    await expect(askBackground(PING)).resolves.toBe(false);
  });

  // An orphaned content script (the extension was reloaded under an open tab)
  // rejects, and some Chrome builds throw synchronously instead.
  it("resolves null when the round-trip rejects", async () => {
    mockSendMessage(() => Promise.reject(new Error("Extension context invalidated")));
    await expect(askBackground(PING)).resolves.toBeNull();
  });

  it("resolves null when sendMessage throws synchronously", async () => {
    mockSendMessage(() => {
      throw new Error("Extension context invalidated");
    });
    await expect(askBackground(PING)).resolves.toBeNull();
  });

  it("resolves null when an undefined reply closes the channel", async () => {
    mockSendMessage(() => Promise.resolve(undefined));
    await expect(askBackground(PING)).resolves.toBeNull();
  });

  // A dead service worker (a throw at the top of background.js leaves no
  // onMessage listener) never answers at all, so the wait has to end itself.
  it("resolves null when the background never answers", async () => {
    vi.useFakeTimers();
    mockSendMessage(() => new Promise(() => {}));
    const pending = askBackground(PING, 8000);
    await vi.advanceTimersByTimeAsync(8000);
    await expect(pending).resolves.toBeNull();
  });
});
