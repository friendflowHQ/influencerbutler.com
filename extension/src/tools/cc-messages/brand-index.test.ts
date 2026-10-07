import { describe, expect, it } from "vitest";
import {
  INDEX_TTL_MS,
  MAX_BRANDS,
  applyFills,
  lookupBrandEntry,
  mergeCampaigns,
  pruneIndex,
  summarizeBrand,
  type BrandIndex,
  type IncomingCampaign,
} from "./brand-index";

const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

function rec(over: Partial<IncomingCampaign> = {}): IncomingCampaign {
  return {
    brand: "PlayBolt",
    campaignId: "amzn1.campaign.A",
    ratePct: 40,
    endsAt: NOW + 10 * DAY,
    source: "grid",
    ...over,
  };
}

describe("mergeCampaigns", () => {
  it("keys by normalized brand and keeps the display name", () => {
    const index = mergeCampaigns({}, [rec({ brand: "Ghostek™" })], NOW);
    expect(Object.keys(index)).toEqual(["ghostek"]);
    expect(index.ghostek!.brand).toBe("Ghostek™");
  });

  it("skips records with no brand", () => {
    expect(mergeCampaigns({}, [rec({ brand: null }), rec({ brand: "  " })], NOW)).toEqual({});
  });

  it("upserts the same campaign id instead of duplicating it", () => {
    let index = mergeCampaigns({}, [rec()], NOW);
    index = mergeCampaigns(index, [rec({ ratePct: 45 })], NOW + 1000);
    expect(index.playbolt!.campaigns).toHaveLength(1);
    expect(index.playbolt!.campaigns[0]!.ratePct).toBe(45);
  });

  it("lets the grid win a rate/date conflict against a later API record", () => {
    let index = mergeCampaigns({}, [rec({ ratePct: 40, source: "grid" })], NOW);
    index = mergeCampaigns(index, [rec({ ratePct: 4, endsAt: null, source: "api" })], NOW);
    expect(index.playbolt!.campaigns[0]).toMatchObject({ ratePct: 40, source: "grid" });
    expect(index.playbolt!.campaigns[0]!.endsAt).toBe(NOW + 10 * DAY);
  });

  it("falls back to rate+end identity when there is no campaign id", () => {
    let index = mergeCampaigns({}, [rec({ campaignId: null })], NOW);
    index = mergeCampaigns(index, [rec({ campaignId: null })], NOW);
    expect(index.playbolt!.campaigns).toHaveLength(1);
  });
});

describe("applyFills", () => {
  it("writes fill counts onto a known campaign id", () => {
    const index = mergeCampaigns({}, [rec()], NOW);
    const next = applyFills(index, {
      "amzn1.campaign.A": { accepted: 7, required: 10, fullyClaimed: false },
    });
    expect(next.playbolt!.campaigns[0]).toMatchObject({ accepted: 7, required: 10 });
  });

  it("returns the same object when nothing matched", () => {
    const index = mergeCampaigns({}, [rec()], NOW);
    expect(applyFills(index, { other: { accepted: 1, required: 2, fullyClaimed: false } })).toBe(index);
  });
});

describe("summarizeBrand", () => {
  it("reports best rate, soonest end, open slots and the Accept target", () => {
    let index = mergeCampaigns(
      {},
      [
        rec({ campaignId: "A", ratePct: 10, endsAt: NOW + 3 * DAY, accepted: 2, required: 5 }),
        rec({ campaignId: "B", ratePct: 20, endsAt: NOW + 12 * DAY, accepted: 9, required: 10 }),
      ],
      NOW,
    );
    index = applyFills(index, {});
    const summary = summarizeBrand(index.playbolt!, NOW)!;
    expect(summary).toMatchObject({
      bestRatePct: 20,
      endsInDays: 3,
      openSlots: 4,
      slotsTaken: 11,
      slotsTotal: 15,
      liveCampaigns: 2,
      bestCampaignId: "B",
      allClaimed: false,
    });
  });

  it("excludes ended campaigns and returns null when none are live", () => {
    const index = mergeCampaigns({}, [rec({ endsAt: NOW - DAY })], NOW);
    expect(summarizeBrand(index.playbolt!, NOW)).toBeNull();
  });

  it("does not target a fully claimed campaign and flags allClaimed", () => {
    const index = mergeCampaigns(
      {},
      [rec({ accepted: 10, required: 10, fullyClaimed: true })],
      NOW,
    );
    const summary = summarizeBrand(index.playbolt!, NOW)!;
    expect(summary.bestCampaignId).toBeNull();
    expect(summary.allClaimed).toBe(true);
    expect(summary.openSlots).toBeNull();
  });

  it("leaves openSlots null when fill is unknown", () => {
    const index = mergeCampaigns({}, [rec()], NOW);
    expect(summarizeBrand(index.playbolt!, NOW)!.openSlots).toBeNull();
  });
});

describe("pruneIndex", () => {
  it("drops entries older than the TTL", () => {
    const index = mergeCampaigns({}, [rec()], NOW);
    expect(pruneIndex(index, NOW + INDEX_TTL_MS + 1)).toEqual({});
    expect(Object.keys(pruneIndex(index, NOW + 1000))).toEqual(["playbolt"]);
  });

  it("drops long-ended campaigns but keeps a just-ended one", () => {
    const index = mergeCampaigns(
      {},
      [rec({ campaignId: "old", endsAt: NOW - 3 * DAY }), rec({ campaignId: "fresh", endsAt: NOW - 1000 })],
      NOW,
    );
    const pruned = pruneIndex(index, NOW);
    expect(pruned.playbolt!.campaigns.map((c) => c.id)).toEqual(["fresh"]);
  });

  it("caps the number of brands, keeping the most recently seen", () => {
    const records: IncomingCampaign[] = [];
    for (let i = 0; i < MAX_BRANDS + 20; i += 1) {
      records.push(rec({ brand: `Brand ${i}`, campaignId: `c${i}` }));
    }
    let index: BrandIndex = {};
    records.forEach((r, i) => {
      index = mergeCampaigns(index, [r], NOW + i);
    });
    const pruned = pruneIndex(index, NOW + records.length);
    expect(Object.keys(pruned)).toHaveLength(MAX_BRANDS);
    expect(pruned["brand " + (MAX_BRANDS + 19)]).toBeDefined();
    expect(pruned["brand 0"]).toBeUndefined();
  });
});

describe("lookupBrandEntry", () => {
  it("matches exactly and by the whitespace-insensitive fallback", () => {
    const index = mergeCampaigns({}, [rec({ brand: "K KAMERIO" })], NOW);
    expect(lookupBrandEntry(index, "K Kamerio")?.brand).toBe("K KAMERIO");
    expect(lookupBrandEntry(index, "KKAMERIO")?.brand).toBe("K KAMERIO");
    expect(lookupBrandEntry(index, "Nope")).toBeNull();
  });
});
