import { afterEach, describe, expect, it, vi } from "vitest";
import { affiliateNetworkAdapters } from "./affiliate-network";
import type { IntegrationAdapter, LinkTarget } from "../types";

const byId = (id: string): IntegrationAdapter => {
  const adapter = affiliateNetworkAdapters.find((a) => a.id === id);
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

describe("levanta adapter", () => {
  const levanta = byId("levanta");

  it("test() connects on 200 and on 404 (key valid, ASIN not covered)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await levanta.test({ apiKey: "k" })).ok).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect((await levanta.test({ apiKey: "k" })).ok).toBe(true);
  });

  it("test() fails on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect((await levanta.test({ apiKey: "bad" })).ok).toBe(false);
  });

  it("generateLink mints an attribution link", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ link: "https://levanta.pxf.io/abc" }), { status: 200 })),
    );
    expect(await levanta.generateLink!(target, { apiKey: "k" })).toBe("https://levanta.pxf.io/abc");
  });

  it("generateLink falls back to the tagged url on error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
    expect(await levanta.generateLink!(target, { apiKey: "k" })).toBe(tagged);
  });
});

describe("archer adapter", () => {
  const archer = byId("archer");

  it("test() fails with no credentials and no network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await archer.test({})).ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("test() connects with a token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await archer.test({ token: "t" })).ok).toBe(true);
  });

  it("test() exchanges username/password for a token then checks a product", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      if (String(url).includes("/token")) {
        return new Response(JSON.stringify({ access_token: "bearer-123" }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    expect((await archer.test({ username: "u", password: "p" })).ok).toBe(true);
    const productCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("get_single_product"))!;
    expect((productCall[1]!.headers as Record<string, string>).Authorization).toBe("Bearer bearer-123");
  });

  it("test() fails when username/password are rejected at /token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "bad" }), { status: 401 })));
    expect((await archer.test({ username: "u", password: "wrong" })).ok).toBe(false);
  });

  it("generateLink mints an attribution link with a token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ attribution_link: "https://archer.link/xy" }), { status: 200 })),
    );
    expect(await archer.generateLink!(target, { token: "t" })).toBe("https://archer.link/xy");
  });
});

describe("logie adapter", () => {
  const logie = byId("logie");

  it("has no generateLink (routes through the primary deeplink provider)", () => {
    expect(logie.generateLink).toBeUndefined();
  });

  it("test() connects on 200 and fails on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
    expect((await logie.test({ apiKey: "k", apiSecret: "s" })).ok).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect((await logie.test({ apiKey: "k", apiSecret: "bad" })).ok).toBe(false);
  });
});

describe("benable adapter", () => {
  const benable = byId("benable");

  it("test() requires a referral url and makes no network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await benable.test({})).ok).toBe(false);
    expect((await benable.test({ referralUrl: "https://benable.com/me" })).ok).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
