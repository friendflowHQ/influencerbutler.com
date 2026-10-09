import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const resolveTextProvider = vi.fn();
const openAiFallbackProvider = vi.fn(() => null);
vi.mock("@/lib/ai-concierge/llm", () => ({
  resolveTextProvider: () => resolveTextProvider(),
  openAiFallbackProvider: () => openAiFallbackProvider(),
}));

import { generateAiPost, renderFormula, rewriteIsFaithful } from "@/lib/ai-post";

const FORMULA = "{{title}}\nPrice Drop: {{percentOff}}% off\nPromo code: {{promoCode}}\nNow {{salePrice}}\n{{url}}";
const FACTS = { title: "Mild Moisture Body Lotion", store: "Amazon", percentOff: 24, salePrice: "$8.99" };

describe("renderFormula", () => {
  it("fills tokens and drops lines with no data", () => {
    const out = renderFormula(FORMULA, FACTS);
    expect(out).toContain("Mild Moisture Body Lotion");
    expect(out).toContain("24% off");
    // no promo code and Amazon is percent-only: both lines elide
    expect(out).not.toContain("Promo code");
    expect(out).not.toContain("Now");
  });

  it("keeps {{url}} literal and renders exact price for non-Amazon stores", () => {
    const out = renderFormula(FORMULA, { ...FACTS, store: "Walmart" });
    expect(out).toContain("Now $8.99");
    expect(out).toContain("{{url}}");
  });

  it("computes total percent from stacked discounts", () => {
    expect(renderFormula("{{totalPercentOff}}% total", { percentOff: 20, couponPercentOff: 15 })).toBe("35% total");
  });
});

describe("rewriteIsFaithful", () => {
  const skeleton = "Mild Lotion\n24% off\n{{url}}";
  it("accepts a faithful rewrite", () => {
    expect(rewriteIsFaithful("Soft skin for less: 24% off lotion {{url}}", skeleton, FACTS)).toBe(true);
  });
  it("rejects an invented percent, a dollar price on Amazon, or a lost link", () => {
    expect(rewriteIsFaithful("50% off lotion {{url}}", skeleton, FACTS)).toBe(false);
    expect(rewriteIsFaithful("Only $8 lotion 24% off {{url}}", skeleton, FACTS)).toBe(false);
    expect(rewriteIsFaithful("24% off lotion", skeleton, FACTS)).toBe(false);
  });
  it("requires the promo code to survive", () => {
    const f = { ...FACTS, promoCode: "SAVE15" };
    expect(rewriteIsFaithful("24% off {{url}}", skeleton, f)).toBe(false);
    expect(rewriteIsFaithful("24% off, use save15 {{url}}", skeleton, f)).toBe(true);
  });
});

describe("generateAiPost", () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    resolveTextProvider.mockReset();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("returns null with nothing to build from", async () => {
    expect(await generateAiPost({ facts: FACTS })).toBeNull();
  });

  it("falls back to the rendered formula when no provider is configured", async () => {
    resolveTextProvider.mockReturnValue(null);
    const out = await generateAiPost({ facts: FACTS, formula: { post: FORMULA, comment: "{{store}} (AD): {{url}}" } });
    expect(out?.source).toBe("formula");
    expect(out?.diag).toBe("no-provider");
    expect(out?.comment).toBe("Amazon (AD): {{url}}");
  });

  it("uses the model rewrite when it is faithful and strips em dashes", async () => {
    resolveTextProvider.mockReturnValue({ url: "https://x", key: "k", model: "m", kind: "openai" });
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ post: "Lotion \u2014 24% off today {{url}}" }) } }] }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const out = await generateAiPost({ facts: FACTS, formula: { post: FORMULA } });
    expect(out?.source).toBe("ai");
    expect(out?.post).not.toContain("\u2014");
    expect(out?.post).toContain("24% off");
  });

  it("keeps the plain formula when the model invents a number", async () => {
    resolveTextProvider.mockReturnValue({ url: "https://x", key: "k", model: "m", kind: "openai" });
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content: JSON.stringify({ post: "Lotion 70% off {{url}}" }) } }] }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const out = await generateAiPost({ facts: FACTS, formula: { post: FORMULA } });
    expect(out?.source).toBe("formula");
    expect(out?.post).toContain("24% off");
  });
});
