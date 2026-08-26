import { afterEach, describe, expect, it, vi } from "vitest";

import { sendFeedback } from "./feedback";

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
