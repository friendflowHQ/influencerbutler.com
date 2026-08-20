import { describe, expect, it } from "vitest";
import type { CcRate, MarketProduct } from "../../shared/messages";
import type { AsinEarnings } from "../../transport/hud-commands";
import {
  bestEpv,
  buildContentAsinIndex,
  buildVideoMoney,
  coolingPicks,
  demandTrend,
  drafts,
  epvPer1000,
  medianViews,
  projectedEarningsCents,
  reshootPicks,
  topEarners,
  vdpContentId,
  type VideoInput,
  type VideoMoney,
} from "./model";

function earnings(asin: string, amount: number, currency = "USD"): AsinEarnings {
  return {
    asin,
    hasEarnings: amount > 0,
    byCurrency: amount > 0 ? [{ currency, amount, count: 1 }] : [],
    totalCount: amount > 0 ? 1 : 0,
  };
}

function market(asin: string, over: Partial<MarketProduct> = {}): MarketProduct {
  return {
    asin,
    marketplace: "amazon.com",
    priceCents: 2000,
    currency: "USD",
    bsrRank: 1000,
    bsrCategory: "Home",
    boughtPastMonth: 100,
    categoryLabel: "Home",
    brand: "Acme",
    capturedAt: "2026-08-01T00:00:00Z",
    estMonthlySales: 500,
    estimateCalibrated: true,
    trend: [],
    ...over,
  };
}

function cc(ratePct: number, endsAt: string | null = null): CcRate {
  return { ratePct, brand: "Acme", endsAt };
}

describe("vdpContentId + buildContentAsinIndex", () => {
  it("extracts a contentId from a /vdp/ url", () => {
    expect(vdpContentId("https://www.amazon.com/vdp/abc123?ref=x")).toBe("abc123");
    expect(vdpContentId("https://www.amazon.com/dp/B00TEST123")).toBeNull();
  });

  it("keys tagged ASINs by contentId, upper-cased and de-duplicated", () => {
    const idx = buildContentAsinIndex([
      { url: "https://a/vdp/v1", taggedAsins: ["b00aaa1111", "B00AAA1111"] },
      { url: "https://a/vdp/v2", taggedAsins: ["b00bbb2222"] },
      { url: "https://a/photo/p1", taggedAsins: ["ignored"] },
    ]);
    expect(idx.get("v1")).toEqual(["B00AAA1111"]);
    expect(idx.get("v2")).toEqual(["B00BBB2222"]);
    expect(idx.size).toBe(2);
  });
});

describe("epvPer1000", () => {
  it("computes earnings per 1,000 views", () => {
    expect(epvPer1000(50, 10_000)).toBe(5);
  });

  it("is null without positive views or amount", () => {
    expect(epvPer1000(50, 0)).toBeNull();
    expect(epvPer1000(50, null)).toBeNull();
    expect(epvPer1000(0, 1000)).toBeNull();
  });
});

describe("projectedEarningsCents", () => {
  it("is views x conversion x commission-per-sale", () => {
    // 10000 views * 2% conversion = 200 sales; $20 * 5% = $1/sale -> $200 = 20000c
    expect(
      projectedEarningsCents({ priceCents: 2000, ratePct: 5, views: 10_000, conversionPct: 2 }),
    ).toBe(20_000);
  });

  it("is null when price or views are unknown", () => {
    expect(
      projectedEarningsCents({ priceCents: null, ratePct: 5, views: 10_000, conversionPct: 2 }),
    ).toBeNull();
    expect(
      projectedEarningsCents({ priceCents: 2000, ratePct: 5, views: null, conversionPct: 2 }),
    ).toBeNull();
  });
});

describe("demandTrend", () => {
  it("reports 'up' when BSR rank falls (selling better)", () => {
    expect(demandTrend([{ bsrRank: 5000 }, { bsrRank: 1000 }])).toBe("up");
  });

  it("reports 'down' when BSR rank rises", () => {
    expect(demandTrend([{ bsrRank: 1000 }, { bsrRank: 5000 }])).toBe("down");
  });

  it("is flat for small moves and null without enough history", () => {
    expect(demandTrend([{ bsrRank: 1000 }, { bsrRank: 1050 }])).toBe("flat");
    expect(demandTrend([{ bsrRank: 1000 }])).toBeNull();
    expect(demandTrend([])).toBeNull();
  });
});

describe("buildVideoMoney", () => {
  const base = {
    marketplace: null as string | null,
    defaultRatePct: 3,
    conversionPct: 2,
  };

  it("uses real earnings + EPV when paired", () => {
    const video: VideoInput = {
      contentId: "v1",
      title: "Storage box",
      status: "published",
      views: 10_000,
      asins: ["B00AAA1111"],
    };
    const vm = buildVideoMoney(video, {
      ...base,
      earnings: new Map([["B00AAA1111", earnings("B00AAA1111", 50)]]),
      market: new Map([["B00AAA1111", market("B00AAA1111")]]),
      ccRates: new Map([["B00AAA1111", cc(12, "2026-12-01")]]),
    });
    expect(vm.earned[0]).toMatchObject({ currency: "USD", amount: 50 });
    expect(vm.epv).toBe(5);
    expect(vm.liveRatePct).toBe(12);
    expect(vm.rateEndsAt).toBe("2026-12-01");
    expect(vm.projectedCents).toBeNull(); // real earnings -> no projection
  });

  it("falls back to projected earnings when unpaired (no earnings)", () => {
    const video: VideoInput = {
      contentId: "v2",
      title: "Frog statue",
      status: "published",
      views: 10_000,
      asins: ["B00BBB2222"],
    };
    const vm = buildVideoMoney(video, {
      ...base,
      earnings: new Map(),
      market: new Map([["B00BBB2222", market("B00BBB2222", { priceCents: 2000 })]]),
      ccRates: new Map([["B00BBB2222", cc(5)]]),
    });
    expect(vm.earned).toHaveLength(0);
    expect(vm.epv).toBeNull();
    // 10000 * 2% * ($20 * 5%) = $200
    expect(vm.projectedCents).toBe(20_000);
  });

  it("takes the best rate and max demand across several tagged products", () => {
    const video: VideoInput = {
      contentId: "v3",
      title: "Bundle",
      status: "published",
      views: 5000,
      asins: ["B00A", "B00B"],
    };
    const vm = buildVideoMoney(video, {
      ...base,
      earnings: new Map(),
      market: new Map([
        ["B00A", market("B00A", { boughtPastMonth: 40 })],
        ["B00B", market("B00B", { boughtPastMonth: 300 })],
      ]),
      ccRates: new Map([
        ["B00A", cc(4)],
        ["B00B", cc(15)],
      ]),
    });
    expect(vm.liveRatePct).toBe(15);
    expect(vm.boughtPastMonth).toBe(300);
  });

  it("degrades cleanly when a video resolved to no products", () => {
    const video: VideoInput = {
      contentId: "v4",
      title: "Draft",
      status: "draft",
      views: null,
      asins: [],
    };
    const vm = buildVideoMoney(video, {
      ...base,
      earnings: new Map(),
      market: new Map(),
      ccRates: new Map(),
    });
    expect(vm.earned).toHaveLength(0);
    expect(vm.epv).toBeNull();
    expect(vm.liveRatePct).toBeNull();
    expect(vm.projectedCents).toBeNull();
    expect(vm.currency).toBe("USD");
  });
});

describe("ranking helpers", () => {
  const list: VideoMoney[] = [
    vm({ contentId: "top", views: 1000, earnedAmount: 90, epv: 90 }),
    vm({ contentId: "mid", views: 4000, earnedAmount: 40, epv: 10 }),
    vm({ contentId: "hot-lowviews", views: 100, liveRatePct: 20 }),
    vm({ contentId: "hot-highviews", views: 9000, liveRatePct: 20 }),
    vm({ contentId: "cooling", views: 3000, demand: "down", asins: ["B00X"] }),
    vm({ contentId: "ended", views: 3000, rateEndsAt: "2020-01-01", asins: ["B00Y"] }),
    vm({ contentId: "draft", status: "draft" }),
  ];

  it("medianViews ignores null view counts", () => {
    expect(medianViews(list)).toBe(3000);
  });

  it("topEarners ranks by real earnings and drops zeros", () => {
    expect(topEarners(list, 5).map((v) => v.contentId)).toEqual(["top", "mid"]);
  });

  it("bestEpv ranks by earnings-per-view", () => {
    expect(bestEpv(list, 5).map((v) => v.contentId)).toEqual(["top", "mid"]);
  });

  it("reshootPicks are hot-rate but under-viewed videos", () => {
    const picks = reshootPicks(list, 10).map((v) => v.contentId);
    expect(picks).toContain("hot-lowviews");
    expect(picks).not.toContain("hot-highviews"); // above median views
    expect(picks).not.toContain("draft");
  });

  it("coolingPicks flag falling demand or an ended campaign", () => {
    const now = Date.parse("2026-08-18T00:00:00Z");
    const ids = coolingPicks(list, now).map((v) => v.contentId);
    expect(ids).toContain("cooling");
    expect(ids).toContain("ended");
  });

  it("drafts returns only draft rows", () => {
    expect(drafts(list).map((v) => v.contentId)).toEqual(["draft"]);
  });
});

// Small VideoMoney factory for the ranking tests.
function vm(over: {
  contentId: string;
  views?: number | null;
  status?: VideoMoney["status"];
  earnedAmount?: number;
  epv?: number | null;
  liveRatePct?: number | null;
  rateEndsAt?: string | null;
  demand?: VideoMoney["demand"];
  asins?: string[];
}): VideoMoney {
  return {
    contentId: over.contentId,
    title: over.contentId,
    status: over.status ?? "published",
    views: over.views ?? null,
    asins: over.asins ?? [],
    earned: over.earnedAmount ? [{ currency: "USD", amount: over.earnedAmount, count: 1 }] : [],
    epv: over.epv ?? null,
    liveRatePct: over.liveRatePct ?? null,
    rateEndsAt: over.rateEndsAt ?? null,
    boughtPastMonth: null,
    demand: over.demand ?? null,
    projectedCents: null,
    currency: "USD",
  };
}
