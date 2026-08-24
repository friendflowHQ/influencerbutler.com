import { describe, expect, it } from "vitest";
import { buildBriefPrompt, parseBriefSections } from "./brief-prompt";
import type { CampaignBriefDemand, CampaignBriefSignals } from "../../shared/messages";

const signals: CampaignBriefSignals = {
  brand: "YARNDODO",
  commissionRatePct: 11,
  remainingBudgetCents: 2_000_000,
  daysRemaining: 68,
  slotsFilled: 679,
  slotsTotal: 800,
  fullyClaimed: false,
  score: 68,
  band: "warm",
  confidence: 70,
  ccStats: null,
  asins: ["B0ABCDEFGH"],
  marketplace: "amazon.com",
  locale: null,
};

const demand: CampaignBriefDemand = {
  asin: "B0ABCDEFGH",
  estMonthlySales: 620,
  estMonthlyRevenueCents: 2_480_000,
  boughtPastMonth: 500,
  priceCents: 4000,
  category: "Bedding",
  calibrated: true,
};

const fullSections = {
  verdictWord: "Worth a look",
  whyTake: ["11% commission is above average", "Budget is deep at $20,000"],
  whatToFilm: ["Bed-making time lapse", "Fabric close-up"],
  pickReason: "The queen set has the strongest demand of the campaign.",
  onAmazon: "Solid onsite pick. Film a short styling clip.",
  offAmazon: ["Cozy bedroom reveal on Reels"],
  audiences: ["Home decor", "New homeowners", "Budget shoppers"],
};

describe("buildBriefPrompt", () => {
  it("includes the campaign numbers and the JSON-only instruction", () => {
    const prompt = buildBriefPrompt(signals, demand);
    expect(prompt).toContain("Brand: YARNDODO");
    expect(prompt).toContain("Commission rate: 11%");
    expect(prompt).toContain("Butler score: 68/100 (band: warm)");
    expect(prompt).toContain("Standout product demand (our catalogue): ASIN B0ABCDEFGH");
    expect(prompt).toContain("Respond ONLY with a JSON object");
  });

  it("states unknowns and no-demand rather than omitting them", () => {
    const bare: CampaignBriefSignals = {
      ...signals,
      brand: null,
      commissionRatePct: null,
      remainingBudgetCents: null,
      daysRemaining: null,
      slotsTotal: null,
    };
    const prompt = buildBriefPrompt(bare, null);
    expect(prompt).toContain("Brand: unknown");
    expect(prompt).toContain("Commission rate: unknown");
    expect(prompt).toContain("Standout product demand: unknown");
    expect(prompt).not.toContain("Creator slots:");
  });

  it("adds a language line when a locale is given", () => {
    const prompt = buildBriefPrompt({ ...signals, locale: "es" }, demand);
    expect(prompt).toContain("Write your answer in this language: es.");
  });
});

describe("parseBriefSections", () => {
  it("parses a clean JSON object", () => {
    const parsed = parseBriefSections(JSON.stringify(fullSections));
    expect(parsed).toEqual(fullSections);
  });

  it("parses JSON wrapped in a ```json fence", () => {
    const fenced = "```json\n" + JSON.stringify(fullSections) + "\n```";
    expect(parseBriefSections(fenced)).toEqual(fullSections);
  });

  it("parses JSON wrapped in a bare ``` fence", () => {
    const fenced = "```\n" + JSON.stringify(fullSections) + "\n```";
    expect(parseBriefSections(fenced)).toEqual(fullSections);
  });

  it("returns null for non-JSON text", () => {
    expect(parseBriefSections("The Butler is unavailable right now.")).toBeNull();
    expect(parseBriefSections("")).toBeNull();
  });

  it("coerces missing fields to safe empties and null pickReason", () => {
    const parsed = parseBriefSections(JSON.stringify({ verdictWord: "Take it" }));
    expect(parsed).toEqual({
      verdictWord: "Take it",
      whyTake: [],
      whatToFilm: [],
      pickReason: null,
      onAmazon: "",
      offAmazon: [],
      audiences: [],
    });
  });

  it("caps array length and item length", () => {
    const many = Array.from({ length: 20 }, (_, i) => `item ${i}`);
    const longItem = "x".repeat(500);
    const parsed = parseBriefSections(
      JSON.stringify({ whyTake: [longItem, ...many] }),
    );
    expect(parsed?.whyTake.length).toBe(8);
    expect(parsed?.whyTake[0]?.length).toBe(240);
  });

  it("drops a blank pickReason to null", () => {
    const parsed = parseBriefSections(JSON.stringify({ pickReason: "   " }));
    expect(parsed?.pickReason).toBeNull();
  });
});
