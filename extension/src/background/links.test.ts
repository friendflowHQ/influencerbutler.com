import { afterEach, describe, expect, it, vi } from "vitest";

// The bulk mint wrapper reads license + tags + settings from storage; mock the
// store so the loop can be exercised without chrome. The pure request layer is
// tested separately in integrations/ib-links-client.test.ts.
const settings = {
  storefrontHandle: null,
  linkButler: { smartRouting: false, pixels: [] },
};
const integrations = { global: { perCountryTags: { US: "t-20" } } };
let licenseKey = "LIC-123";

vi.mock("../storage/store", () => ({
  getState: async () => ({ auth: { licenseKey } }),
  getSettings: async () => settings,
  getIntegrations: async () => integrations,
  patchSettings: async () => settings,
}));

import { bulkMintBranded } from "./links";

afterEach(() => {
  vi.unstubAllGlobals();
  licenseKey = "LIC-123";
});

describe("bulkMintBranded", () => {
  it("mints one branded link per product and reports counts + mapping", async () => {
    let n = 0;
    const fetchMock: ReturnType<typeof vi.fn> = vi.fn(async () => {
      n += 1;
      const slug = `slug${n}`;
      return new Response(
        JSON.stringify({ ok: true, slug, shortUrl: `https://links.influencerbutler.com/l/${slug}` }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await bulkMintBranded([
      { asin: "B01", marketplace: "amazon.com" },
      { asin: "B02", marketplace: "amazon.com" },
    ]);

    expect(result.minted).toBe(2);
    expect(result.failed).toBe(0);
    expect(result.capped).toBe(false);
    expect(result.items[0]).toMatchObject({ asin: "B01", ok: true, slug: "slug1" });
    expect(result.items[1]).toMatchObject({ asin: "B02", ok: true, slug: "slug2" });
    // With smart routing off, exactly one create call per product (no publish).
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://links.influencerbutler.com/api/links");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer LIC-123");
    // The target url carries the per-country tag, like "Copy my link".
    expect(JSON.parse(init.body as string).url).toContain("tag=t-20");
  });

  it("records every item as failed when not signed in, without minting", async () => {
    licenseKey = "";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await bulkMintBranded([{ asin: "B01", marketplace: "amazon.com" }]);
    expect(result.minted).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.items[0]).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
