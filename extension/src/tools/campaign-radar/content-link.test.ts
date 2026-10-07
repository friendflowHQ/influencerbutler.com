import { describe, expect, it } from "vitest";
import {
  LINK_FAIL_BACKOFF_MS,
  LINK_NO_CAMPAIGN_RECHECK_MS,
  detectContentType,
  parseCommissionPercent,
  parseDateRangeEnd,
  pendingLinks,
  pickBestCampaign,
  readLinkLedger,
  recordLinkAttempt,
  shouldSubmitLink,
  submittedUrlMatches,
  type ActiveCardMeta,
} from "./content-link";

const NOW = new Date("2026-10-07T12:00:00Z").getTime();

describe("detectContentType", () => {
  it("maps hosts to Amazon's dropdown option labels", () => {
    expect(detectContentType("https://www.youtube.com/watch?v=x")).toBe("youtube video");
    expect(detectContentType("https://youtu.be/x")).toBe("youtube video");
    expect(detectContentType("https://www.tiktok.com/@a/video/1")).toBe("tiktok video");
    expect(detectContentType("https://www.instagram.com/p/abc/")).toBe("instagram post");
    expect(detectContentType("https://www.instagram.com/stories/me/1/")).toBe("instagram story");
    expect(detectContentType("https://www.facebook.com/me/posts/1")).toBe("facebook post");
    expect(detectContentType("https://www.facebook.com/stories/1")).toBe("facebook story");
    expect(detectContentType("https://x.com/a/status/1")).toBe("twitter post");
    expect(detectContentType("https://example.com/post")).toBe("social media post");
  });

  it("treats an Amazon storefront /video link as a video, other Amazon links as social", () => {
    expect(detectContentType("https://www.amazon.com/live/video/abc")).toBe("video");
    expect(detectContentType("https://www.amazon.com/shop/me/photo/abc")).toBe("social media post");
  });

  it("defaults to video for blank or unparseable input", () => {
    expect(detectContentType("")).toBe("video");
    expect(detectContentType("   ")).toBe("video");
  });
});

describe("date and commission parsing", () => {
  it("reads the end date of a range and rejects rollovers", () => {
    expect(parseDateRangeEnd("6/1/26 - 9/30/26")).toBe(new Date(2026, 8, 30).getTime());
    expect(parseDateRangeEnd("2/31/26")).toBeNull();
    expect(parseDateRangeEnd("no dates")).toBeNull();
  });

  it("takes the highest plausible percent", () => {
    expect(parseCommissionPercent("Affiliate+ 30% bonus 10%")).toBe(30);
    expect(parseCommissionPercent("0% 150%")).toBeNull();
    expect(parseCommissionPercent("")).toBeNull();
  });
});

function card(index: number, over: Partial<ActiveCardMeta> = {}): ActiveCardMeta {
  return { index, href: `/p/connect/request?adId=${index}`, campaignId: `c${index}`, dateRange: "", cardText: "", ...over };
}

describe("pickBestCampaign", () => {
  it("prefers the latest end date, then the higher commission, then card order", () => {
    const best = pickBestCampaign([
      card(0, { dateRange: "6/1/26 - 9/30/26", cardText: "10%" }),
      card(1, { dateRange: "6/1/26 - 12/31/26", cardText: "5%" }),
      card(2, { dateRange: "6/1/26 - 12/31/26", cardText: "8%" }),
    ]);
    expect(best?.index).toBe(2);
    const tie = pickBestCampaign([card(0), card(1)]);
    expect(tie?.index).toBe(0);
  });

  it("ranks open campaigns above known-full ones but never drops the last candidate", () => {
    const best = pickBestCampaign([
      card(0, { dateRange: "1/1/26 - 12/31/26", full: true }),
      card(1, { dateRange: "1/1/26 - 6/30/26" }),
    ]);
    expect(best?.index).toBe(1);
    const onlyFull = pickBestCampaign([card(0, { full: true })]);
    expect(onlyFull?.index).toBe(0);
    expect(pickBestCampaign([])).toBeNull();
  });
});

describe("submittedUrlMatches", () => {
  it("matches the same URL ignoring protocol, www, query and trailing slash", () => {
    expect(
      submittedUrlMatches("http://www.amazon.com/live/video/abc/?x=1", "https://amazon.com/live/video/abc"),
    ).toBe(true);
  });

  it("does not count a shorter or different link", () => {
    expect(submittedUrlMatches("https://amazon.com", "https://amazon.com/live/video/abc")).toBe(false);
    expect(submittedUrlMatches("video", "https://amazon.com/live/video/abc")).toBe(false);
    // A bare-word target is never "host + path".
    expect(submittedUrlMatches("video", "video")).toBe(false);
  });
});

describe("link ledger rules", () => {
  const url = "https://www.amazon.com/live/video/abc";

  it("submits when there is no entry, never repeats the same URL, but does a new one", () => {
    expect(shouldSubmitLink(undefined, url, NOW)).toBe(true);
    const done = { status: "submitted" as const, url, at: NOW, attempts: 1 };
    expect(shouldSubmitLink(done, url, NOW)).toBe(false);
    expect(shouldSubmitLink(done, `${url}2`, NOW)).toBe(true);
  });

  it("backs off after a failure and rechecks a no-campaign ASIN after a day", () => {
    const failed = { status: "failed" as const, url, at: NOW, attempts: 1 };
    expect(shouldSubmitLink(failed, url, NOW + LINK_FAIL_BACKOFF_MS - 1)).toBe(false);
    expect(shouldSubmitLink(failed, url, NOW + LINK_FAIL_BACKOFF_MS)).toBe(true);
    const none = { status: "no-campaign" as const, url, at: NOW, attempts: 1 };
    expect(shouldSubmitLink(none, url, NOW + LINK_NO_CAMPAIGN_RECHECK_MS - 1)).toBe(false);
    expect(shouldSubmitLink(none, url, NOW + LINK_NO_CAMPAIGN_RECHECK_MS)).toBe(true);
  });

  it("records attempts and counts them", () => {
    let ledger = recordLinkAttempt({}, "B000000001", "failed", url, NOW);
    ledger = recordLinkAttempt(ledger, "B000000001", "submitted", url, NOW + 1);
    expect(ledger.B000000001).toEqual({ status: "submitted", url, at: NOW + 1, attempts: 2 });
  });

  it("drops junk when reading a stored ledger", () => {
    const out = readLinkLedger({
      B000000001: { status: "submitted", url, at: 5, attempts: 2 },
      bad: { status: "submitted", url, at: 5 },
      B000000002: { status: "nonsense", url, at: 5 },
    });
    expect(Object.keys(out)).toEqual(["B000000001"]);
    expect(readLinkLedger(null)).toEqual({});
  });
});

describe("pendingLinks", () => {
  const storefront = {
    B000000001: { url: "https://www.amazon.com/live/video/1" },
    B000000002: { url: "https://www.amazon.com/live/video/2" },
    B000000003: { url: "https://www.amazon.com/live/video/3" },
  };

  it("lists accepted ASINs that have a storefront video and are due, capped", () => {
    const ledger = recordLinkAttempt({}, "B000000002", "submitted", storefront.B000000002.url, NOW);
    const out = pendingLinks(
      ["b000000001", "B000000002", "B000000004", "B000000003", "B000000001"],
      storefront,
      ledger,
      NOW,
    );
    expect(out.map((p) => p.asin)).toEqual(["B000000001", "B000000003"]);
    expect(pendingLinks(["B000000001", "B000000003"], storefront, {}, NOW, 1)).toHaveLength(1);
  });
});
