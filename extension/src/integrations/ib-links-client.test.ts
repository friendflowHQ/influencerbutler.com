import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPublishTags,
  defaultRouting,
  fetchStats,
  listLinks,
  mintLink,
  repointLink,
  savePixels,
} from "./ib-links-client";

afterEach(() => vi.unstubAllGlobals());

function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("mintLink", () => {
  it("posts the tagged url with the license bearer and returns slug + shortUrl", async () => {
    const fetchMock = mockFetch({ ok: true, slug: "abc1234", shortUrl: "https://links.influencerbutler.com/l/abc1234" });
    const result = await mintLink(
      { url: "https://www.amazon.com/dp/B01?tag=t-20", asin: "B01", marketplace: "amazon.com" },
      "LIC-123",
    );
    expect(result).toEqual({
      ok: true,
      slug: "abc1234",
      shortUrl: "https://links.influencerbutler.com/l/abc1234",
      reused: false,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://links.influencerbutler.com/api/links");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer LIC-123");
    expect(JSON.parse(init.body as string)).toMatchObject({
      url: "https://www.amazon.com/dp/B01?tag=t-20",
      asin: "B01",
      marketplace: "amazon.com",
      sourceId: "extension",
    });
  });

  it("derives the slug from the short url when the payload omits it", async () => {
    mockFetch({ ok: true, shortUrl: "https://links.influencerbutler.com/l/xyz9" });
    const result = await mintLink({ url: "https://www.amazon.com/dp/B01" }, "LIC");
    expect(result).toMatchObject({ ok: true, slug: "xyz9" });
  });

  it("does not call the network when not signed in", async () => {
    const fetchMock = mockFetch({});
    const result = await mintLink({ url: "https://www.amazon.com/dp/B01" }, "");
    expect(result).toEqual({ ok: false, error: expect.any(String), code: "not_signed_in" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps 402 to upgrade_required", async () => {
    mockFetch({ ok: false }, 402);
    const result = await mintLink({ url: "https://www.amazon.com/dp/B01" }, "LIC");
    expect(result).toMatchObject({ ok: false, code: "upgrade_required" });
  });

  it("maps 401 to not_signed_in", async () => {
    mockFetch({ ok: false }, 401);
    const result = await mintLink({ url: "https://www.amazon.com/dp/B01" }, "LIC");
    expect(result).toMatchObject({ ok: false, code: "not_signed_in" });
  });

  it("returns network on a thrown fetch", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("offline");
    }));
    const result = await mintLink({ url: "https://www.amazon.com/dp/B01" }, "LIC");
    expect(result).toMatchObject({ ok: false, code: "network" });
  });
});

describe("repointLink", () => {
  it("maps 409 to target_in_use and 404 to not_found", async () => {
    mockFetch({ ok: false }, 409);
    expect(await repointLink({ slug: "s", url: "https://www.amazon.com/dp/B02" }, "LIC")).toMatchObject({
      ok: false,
      code: "target_in_use",
    });
    mockFetch({ ok: false }, 404);
    expect(await repointLink({ slug: "s", url: "https://www.amazon.com/dp/B02" }, "LIC")).toMatchObject({
      ok: false,
      code: "not_found",
    });
  });

  it("returns the new target on success", async () => {
    mockFetch({ ok: true, slug: "s", shortUrl: "https://links.influencerbutler.com/l/s", targetUrl: "https://x/y" });
    const result = await repointLink({ slug: "s", url: "https://x/y" }, "LIC");
    expect(result).toMatchObject({ ok: true, slug: "s", targetUrl: "https://x/y" });
  });
});

describe("buildPublishTags", () => {
  it("uppercases marketplace keys and keeps tag values, matching the worker's tags shape", () => {
    // The worker's sanitizeTags upper-cases the key and looks up by marketplace
    // code (US, UK, ...); perCountryTags is already keyed that way.
    expect(buildPublishTags({ us: "a-20", UK: "b-21" }, null)).toEqual({ US: "a-20", UK: "b-21" });
  });

  it("falls back to the storefront handle for US only", () => {
    expect(buildPublishTags({ UK: "b-21" }, "myhandle")).toEqual({ UK: "b-21", US: "myhandle" });
    expect(buildPublishTags({ US: "a-20" }, "myhandle")).toEqual({ US: "a-20" });
  });

  it("drops empty tags", () => {
    expect(buildPublishTags({ US: "  ", CA: "c-20" }, null)).toEqual({ CA: "c-20" });
  });
});

describe("defaultRouting", () => {
  it("matches the worker's sanitizeRouting defaults (Passport on, interstitial off)", () => {
    expect(defaultRouting()).toEqual({
      doormanOpen: true,
      passport: { enabled: true },
      interstitial: { enabled: false, autoContinueSeconds: 2, poweredBy: false },
    });
  });
});

describe("fetchStats", () => {
  it("normalizes the dashboard payload and extracts breakdown labels", async () => {
    mockFetch({
      ok: true,
      range: "30d",
      totalClicks: 42,
      prevClicks: 20,
      linksCreated: 5,
      series: [{ day: "2026-07-01", clicks: 3 }],
      topLinks: [{ slug: "abc", shortUrl: "https://links.influencerbutler.com/l/abc", clicks: 12, asin: "B01", targetUrl: "https://x", label: "hat" }],
      countries: [{ country: "US", clicks: 30 }],
      devices: [{ device: "mobile", clicks: 25 }],
      surfaces: [{ surface: "instagram", clicks: 15 }],
    });
    const result = await fetchStats("LIC", "30d");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.stats.totalClicks).toBe(42);
    expect(result.stats.series).toEqual([{ day: "2026-07-01", clicks: 3 }]);
    expect(result.stats.topLinks[0]).toMatchObject({ slug: "abc", clicks: 12, asin: "B01" });
    expect(result.stats.countries).toEqual([{ label: "US", clicks: 30 }]);
    expect(result.stats.devices).toEqual([{ label: "mobile", clicks: 25 }]);
    expect(result.stats.surfaces).toEqual([{ label: "instagram", clicks: 15 }]);
  });
});

describe("listLinks", () => {
  it("maps registry rows and passes the cursor", async () => {
    const fetchMock = mockFetch({
      ok: true,
      links: [{ slug: "s1", shortUrl: "https://links.influencerbutler.com/l/s1", targetUrl: "https://x", asin: "B01", marketplace: "amazon.com", label: null, createdAt: 1, originalTargetUrl: null, repointedAt: null }],
      nextCursor: "1:s1",
    });
    const result = await listLinks("LIC", "0:foo");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.links[0]).toMatchObject({ slug: "s1", asin: "B01" });
    expect(result.nextCursor).toBe("1:s1");
    expect(String(fetchMock.mock.calls[0]![0])).toContain("cursor=0%3Afoo");
  });
});

describe("savePixels", () => {
  it("posts the pixel list and returns the sanitized result", async () => {
    const fetchMock = mockFetch({ ok: true, pixels: [{ platform: "meta", id: "123", name: "Main" }] });
    const result = await savePixels([{ platform: "meta", id: "123", name: "Main" }], "LIC");
    expect(result).toEqual({ ok: true, pixels: [{ platform: "meta", id: "123", name: "Main" }] });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      pixels: [{ platform: "meta", id: "123", name: "Main" }],
    });
  });
});
