import { afterEach, describe, expect, it, vi } from "vitest";
import { isAndroid, isMobileUserAgent, resetPlatformCacheForTests } from "./platform";
import { ASIN_URL_RE } from "../amazon/product-signals";

const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function stubNavigator(nav: Record<string, unknown>): void {
  vi.stubGlobal("navigator", nav);
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetPlatformCacheForTests();
});

describe("isMobileUserAgent", () => {
  it("reads userAgentData first", () => {
    stubNavigator({ userAgent: DESKTOP_UA, userAgentData: { mobile: true, platform: "Android" } });
    expect(isMobileUserAgent()).toBe(true);
    stubNavigator({ userAgent: ANDROID_UA, userAgentData: { mobile: false, platform: "Windows" } });
    expect(isMobileUserAgent()).toBe(false);
  });

  it("falls back to the user agent string", () => {
    stubNavigator({ userAgent: ANDROID_UA });
    expect(isMobileUserAgent()).toBe(true);
    stubNavigator({ userAgent: DESKTOP_UA });
    expect(isMobileUserAgent()).toBe(false);
  });
});

describe("isAndroid", () => {
  it("uses chrome.runtime.getPlatformInfo when available", async () => {
    stubNavigator({ userAgent: DESKTOP_UA });
    vi.stubGlobal("chrome", { runtime: { getPlatformInfo: async () => ({ os: "android" }) } });
    expect(await isAndroid()).toBe(true);
  });

  it("reports desktop platforms as not Android", async () => {
    stubNavigator({ userAgent: ANDROID_UA });
    vi.stubGlobal("chrome", { runtime: { getPlatformInfo: async () => ({ os: "win" }) } });
    expect(await isAndroid()).toBe(false);
  });

  it("falls back to the user agent when getPlatformInfo is missing", async () => {
    stubNavigator({ userAgent: ANDROID_UA });
    vi.stubGlobal("chrome", { runtime: {} });
    expect(await isAndroid()).toBe(true);
  });
});

describe("ASIN_URL_RE", () => {
  it("matches desktop and mobile-web product paths", () => {
    expect("https://www.amazon.com/dp/B01JGG5CH4".match(ASIN_URL_RE)?.[1]).toBe("B01JGG5CH4");
    expect("https://www.amazon.com/gp/product/B01JGG5CH4".match(ASIN_URL_RE)?.[1]).toBe("B01JGG5CH4");
    expect("https://www.amazon.com/gp/aw/d/B01JGG5CH4?th=1".match(ASIN_URL_RE)?.[1]).toBe("B01JGG5CH4");
  });
});
