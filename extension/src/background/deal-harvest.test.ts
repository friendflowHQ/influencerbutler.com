import { afterEach, describe, expect, it, vi } from "vitest";
import { harvestDealSites } from "./deal-harvest";

// Deal Sites Harvester, deep-scan (render) path. The extractor itself is unit
// tested in tools/deal-harvester; here we prove the opt-in render pass opens a
// tab, reads the rendered DOM, and feeds it through the same extractor so a
// JavaScript-rendered site that the plain fetch missed yields its deals, while
// the default (fetch-only) path leaves such a site empty.

const EMPTY_HTML = "<html><body>loading deals...</body></html>";
const RENDERED_HTML = '<a href="https://www.amazon.com/dp/B0RENDER01">Deal</a>';

function stubFetch(html: string): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, url: "", text: async () => html })),
  );
}

// Minimal chrome.tabs + chrome.scripting stub: the tab reports "complete"
// immediately and executeScript returns the rendered HTML.
function stubChromeRender(html: string): { remove: ReturnType<typeof vi.fn> } {
  const remove = vi.fn(async () => {});
  vi.stubGlobal("chrome", {
    tabs: {
      create: vi.fn(async () => ({ id: 42, status: "loading" })),
      get: vi.fn(async () => ({ id: 42, status: "complete" })),
      remove,
      onUpdated: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: {
      executeScript: vi.fn(async () => [{ result: html }]),
    },
  });
  return { remove };
}

describe("harvestDealSites deep scan", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("reads a script-rendered site the plain fetch missed and closes the tab", async () => {
    vi.useFakeTimers();
    stubFetch(EMPTY_HTML);
    const { remove } = stubChromeRender(RENDERED_HTML);

    const pending = harvestDealSites(["https://spa.example/"], { render: true });
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.deals.map((d) => d.asin)).toContain("B0RENDER01");
    expect(result.rendered).toEqual(["https://spa.example/"]);
    expect(remove).toHaveBeenCalledWith(42);
  });

  it("leaves the site empty when deep scan is off (no tab opened)", async () => {
    stubFetch(EMPTY_HTML);
    const chromeCreate = vi.fn();
    vi.stubGlobal("chrome", { tabs: { create: chromeCreate } });

    const result = await harvestDealSites(["https://spa.example/"], { render: false });

    expect(result.deals).toHaveLength(0);
    expect(result.rendered).toBeUndefined();
    expect(chromeCreate).not.toHaveBeenCalled();
  });
});
