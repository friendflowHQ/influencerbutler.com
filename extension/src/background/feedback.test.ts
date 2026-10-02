import { afterEach, describe, expect, it, vi } from "vitest";

import { archiveLocalFeedback, sendFeedback, unarchiveLocalFeedback } from "./feedback";
import type { MyFeedbackItem } from "../shared/messages";

// Minimal chrome stub: an empty storage.local (so getState migrates a fresh,
// signed-out state) plus a manifest whose version the submission must report.
function stubChrome(version: string) {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async () => ({})),
        set: vi.fn(async () => undefined),
      },
    },
    runtime: { getManifest: () => ({ version }) },
  });
}

// A storage.local stub backed by a real in-memory object, keyed the way
// chrome.storage.local.get/set key a single storage key -- lets a test read
// back what archiveLocalFeedback/unarchiveLocalFeedback actually wrote.
function stubChromeStorage(rows: MyFeedbackItem[]) {
  const backing: Record<string, unknown> = { "ib-my-feedback": rows };
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: backing[key] })),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(backing, patch);
        }),
      },
    },
  });
  return () => backing["ib-my-feedback"] as MyFeedbackItem[];
}

function okFetch() {
  return vi.fn(async (_url: string, _init: RequestInit) => ({ ok: true, json: async () => ({}) }));
}

function bodyOf(fetchMock: ReturnType<typeof okFetch>): Record<string, unknown> {
  const init = fetchMock.mock.calls[0]?.[1];
  return JSON.parse(String(init?.body));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendFeedback", () => {
  it("reports the running manifest version, not a source constant", async () => {
    stubChrome("0.1.6");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendFeedback({ feedbackType: "bug", message: "Buttons overlap" });

    expect(result).toEqual({ ok: true });
    expect(bodyOf(fetchMock).ext_version).toBe("0.1.6");
  });

  it("follows the manifest when the extension is bumped", async () => {
    stubChrome("0.2.0");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    await sendFeedback({ feedbackType: "bug", message: "Still overlapping" });

    expect(bodyOf(fetchMock).ext_version).toBe("0.2.0");
  });

  it("rejects a too-short message without calling the endpoint", async () => {
    stubChrome("0.1.6");
    const fetchMock = okFetch();
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendFeedback({ feedbackType: "bug", message: "hi" });

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("archiveLocalFeedback / unarchiveLocalFeedback", () => {
  it("hides a submission from Active without deleting it", async () => {
    const getBacking = stubChromeStorage([
      { id: "fb-1", type: "bug", title: "Buttons overlap", status: "sent", createdAt: "2026-01-01", attachmentCount: 0 },
    ]);

    const result = await archiveLocalFeedback("fb-1");

    expect(result).toEqual({ ok: true });
    expect(getBacking()).toEqual([
      expect.objectContaining({ id: "fb-1", archived: true }),
    ]);
  });

  it("is idempotent when archiving an already-archived row", async () => {
    stubChromeStorage([
      { id: "fb-1", type: "bug", title: "x", status: "sent", createdAt: "2026-01-01", attachmentCount: 0, archived: true },
    ]);

    const result = await archiveLocalFeedback("fb-1");

    expect(result).toEqual({ ok: true });
  });

  it("restores an archived submission to Active", async () => {
    const getBacking = stubChromeStorage([
      { id: "fb-1", type: "bug", title: "x", status: "sent", createdAt: "2026-01-01", attachmentCount: 0, archived: true },
    ]);

    const result = await unarchiveLocalFeedback("fb-1");

    expect(result).toEqual({ ok: true });
    expect(getBacking()).toEqual([
      expect.objectContaining({ id: "fb-1", archived: false }),
    ]);
  });

  it("reports not found for a missing id", async () => {
    stubChromeStorage([]);

    expect(await archiveLocalFeedback("missing")).toEqual({ ok: false, error: "Not found" });
    expect(await unarchiveLocalFeedback("missing")).toEqual({ ok: false, error: "Not found" });
  });
});
