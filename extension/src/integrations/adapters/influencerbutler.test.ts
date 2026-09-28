import { afterEach, describe, expect, it, vi } from "vitest";
import { influencerButlerLinkAdapter as ib } from "./influencerbutler";
import { LinkNoticeError } from "../link-notice";
import type { LinkTarget } from "../types";

const target: LinkTarget = {
  asin: "B0ABC12345",
  marketplace: "amazon.com",
  url: "https://www.amazon.com/dp/B0ABC12345",
  tag: "mytag-20",
};

afterEach(() => vi.unstubAllGlobals());

describe("influencer butler branded link adapter", () => {
  it("posts the affiliate-tagged url with the license bearer and returns the short url", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true, shortUrl: "https://links.influencerbutler.com/l/abc1234" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const link = await ib.generateLink!(target, { licenseKey: "LICENSE-KEY-123" });
    expect(link).toBe("https://links.influencerbutler.com/l/abc1234");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://links.influencerbutler.com/api/links");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer LICENSE-KEY-123");
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({
      url: "https://www.amazon.com/dp/B0ABC12345?tag=mytag-20",
      asin: "B0ABC12345",
      marketplace: "amazon.com",
      sourceId: "extension",
    });
  });

  it("raises a signInRequired notice without a network call when not signed in", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    // The fallback link itself is routing's job (it returns the tagged url);
    // the adapter's job is to say why, so the UI is not silent about it.
    await expect(ib.generateLink!(target, {})).rejects.toBeInstanceOf(LinkNoticeError);
    await expect(ib.generateLink!(target, {})).rejects.toMatchObject({
      notice: "signInRequired",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws on a non-2xx so routing falls back to the tagged url", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    await expect(ib.generateLink!(target, { licenseKey: "k" })).rejects.toThrow();
  });

  it("test() fails without a license and does not call the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await ib.test({});
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("test() succeeds for a free-tier license (no paid gate)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, links: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await ib.test({ licenseKey: "free-tier-key" });
    expect(result.ok).toBe(true);
  });

  it("test() succeeds on a 200 from the list endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ ok: true, links: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await ib.test({ licenseKey: "paid-key" });
    expect(result.ok).toBe(true);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("/api/links/list");
  });
});
