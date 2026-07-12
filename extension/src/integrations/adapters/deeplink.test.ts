import { afterEach, describe, expect, it, vi } from "vitest";
import { deeplinkAdapters } from "./deeplink";
import type { IntegrationAdapter, LinkTarget } from "../types";

const byId = (id: string): IntegrationAdapter => {
  const adapter = deeplinkAdapters.find((a) => a.id === id);
  if (!adapter) throw new Error(`no adapter ${id}`);
  return adapter;
};

const target: LinkTarget = {
  asin: "B0ABC12345",
  marketplace: "amazon.com",
  url: "https://www.amazon.com/dp/B0ABC12345",
  tag: "mytag-20",
};
const tagged = "https://www.amazon.com/dp/B0ABC12345?tag=mytag-20";

afterEach(() => vi.unstubAllGlobals());

describe("deeplink registry", () => {
  it("no longer includes PostTap and keeps the real providers", () => {
    const ids = deeplinkAdapters.map((a) => a.id);
    expect(ids).not.toContain("posttap");
    expect(ids).toEqual(expect.arrayContaining(["linktwin", "urlgenius", "geniuslink", "selfhosted"]));
  });
});

describe("urlgenius adapter", () => {
  const urlgenius = byId("urlgenius");

  it("test() fails without a key and does not call the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await urlgenius.test({});
    expect(res.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("test() connects on a 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await urlgenius.test({ apiKey: "k" })).ok).toBe(true);
  });

  it("test() reports a rejected key on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect((await urlgenius.test({ apiKey: "bad" })).ok).toBe(false);
  });

  it("generateLink returns the minted short url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ payload: { link: { short_url: "https://urlgeni.us/x" } } }), { status: 200 })),
    );
    expect(await urlgenius.generateLink!(target, { apiKey: "k" })).toBe("https://urlgeni.us/x");
  });

  it("generateLink falls back to the tagged url on error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await urlgenius.generateLink!(target, { apiKey: "k" })).toBe(tagged);
  });

  it("generateLink returns the tagged url without a call when unconfigured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await urlgenius.generateLink!(target, {})).toBe(tagged);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("linktwin adapter", () => {
  const linktwin = byId("linktwin");

  it("test() connects on error:0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: 0 }), { status: 200 })));
    expect((await linktwin.test({ apiKey: "k" })).ok).toBe(true);
  });

  it("test() fails on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect((await linktwin.test({ apiKey: "bad" })).ok).toBe(false);
  });

  it("generateLink returns the minted short url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: 0, shorturl: "https://linktw.in/xy" }), { status: 200 })),
    );
    expect(await linktwin.generateLink!(target, { apiKey: "k" })).toBe("https://linktw.in/xy");
  });

  it("generateLink falls back when the api signals an error code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: 1, message: "nope" }), { status: 200 })),
    );
    expect(await linktwin.generateLink!(target, { apiKey: "k" })).toBe(tagged);
  });
});

describe("geniuslink adapter", () => {
  const geniuslink = byId("geniuslink");

  it("test() requires key, secret and a numeric group id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await geniuslink.test({ apiKey: "k" })).ok).toBe(false);
    expect((await geniuslink.test({ apiKey: "k", apiSecret: "s", groupId: "abc" })).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("test() confirms the configured group exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ Groups: [{ Id: "42" }] }), { status: 200 })),
    );
    expect((await geniuslink.test({ apiKey: "k", apiSecret: "s", groupId: "42" })).ok).toBe(true);
  });

  it("test() fails when the group is not in the account", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ Groups: [{ Id: "7" }] }), { status: 200 })),
    );
    expect((await geniuslink.test({ apiKey: "k", apiSecret: "s", groupId: "42" })).ok).toBe(false);
  });

  it("generateLink builds a short url from domain and code parts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ shortUrl: { domain: "geni.us", code: "abc" } }), { status: 200 })),
    );
    expect(await geniuslink.generateLink!(target, { apiKey: "k", apiSecret: "s", groupId: "42" })).toBe(
      "https://geni.us/abc",
    );
  });
});
