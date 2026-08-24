import { describe, expect, it } from "vitest";
import type { ProductSignals } from "../../amazon/product-signals";
import { DEFAULTS } from "../../storage/schema";
import type { VoiceoverSettings } from "../../storage/schema";
import {
  DISCLOSURE_DIRECTIVES,
  HOOK_STYLE_DIRECTIVES,
  PACING_DIRECTIVES,
  VIDEO_TYPE_DIRECTIVES,
  VIDEO_TYPE_LABELS,
  buildVoiceoverPrompt,
  clampLength,
  classifyApparel,
  findDeniedBrand,
} from "./voiceover-prompt";

function signals(overrides: Partial<ProductSignals> = {}): ProductSignals {
  return {
    asin: "B0TEST1234",
    marketplace: "US",
    title: "Portable Blender for Smoothies",
    priceCents: 2999,
    currency: "USD",
    inStock: true,
    boughtPastMonth: 500,
    brand: "Visit the BlendCo Store",
    commissionRatePct: null,
    category: "Kitchen & Dining",
    parentAsin: null,
    variationAsins: [],
    bestsellerRank: null,
    imageUrl: null,
    ...overrides,
  };
}

function voiceover(overrides: Partial<VoiceoverSettings> = {}): VoiceoverSettings {
  const base = structuredClone(DEFAULTS.settings.voiceover);
  return {
    ...base,
    ...overrides,
    defaults: { ...base.defaults, ...(overrides.defaults ?? {}) },
    aboutMe: { ...base.aboutMe, ...(overrides.aboutMe ?? {}) },
  };
}

describe("clampLength", () => {
  it("clamps to the 5-120 second window and defaults NaN to 30", () => {
    expect(clampLength(4)).toBe(5);
    expect(clampLength(121)).toBe(120);
    expect(clampLength(45)).toBe(45);
    expect(clampLength(Number.NaN)).toBe(30);
  });
});

describe("classifyApparel", () => {
  it("buckets shoes, beauty, and everything else", () => {
    expect(classifyApparel("Cloudfoam Running Sneakers", null)).toBe("shoes");
    expect(classifyApparel("Volumizing Mascara, Black", "Beauty & Personal Care")).toBe("beauty");
    expect(classifyApparel("Portable Blender for Smoothies", "Kitchen & Dining")).toBe("other");
    expect(classifyApparel(null, null)).toBe("other");
  });

  it("tests specific buckets before broad ones so a dress shoe is a shoe", () => {
    expect(classifyApparel("Men's Leather Dress Shoe", null)).toBe("shoes");
  });
});

describe("buildVoiceoverPrompt", () => {
  it("includes the configured disclosure and denylist rule", () => {
    const prompt = buildVoiceoverPrompt(
      signals(),
      voiceover({
        defaults: { disclosureKey: "affiliate-link" },
        brandDenylist: ["Dyson", "Shark"],
      } as Partial<VoiceoverSettings>),
    );
    expect(prompt).toContain(DISCLOSURE_DIRECTIVES["affiliate-link"]);
    expect(prompt).toContain("Never mention any of these brands under any circumstances: Dyson, Shark.");
    expect(prompt).toContain("Brand (do NOT say this in the script): Visit the BlendCo Store");
  });

  it("uses the custom hook verbatim, falling back to relatable when empty", () => {
    const withText = buildVoiceoverPrompt(
      signals(),
      voiceover({ defaults: { hookStyle: "custom", hookCustom: "Stop scrolling." } } as never),
    );
    expect(withText).toContain('lightly polished): "Stop scrolling."');

    const withoutText = buildVoiceoverPrompt(
      signals(),
      voiceover({ defaults: { hookStyle: "custom", hookCustom: "" } } as never),
    );
    expect(withoutText).toContain(HOOK_STYLE_DIRECTIVES.relatable);
  });

  it("injects About Me fit only for apparel/beauty products", () => {
    const vo = voiceover({
      aboutMe: { height: "5'6", shoeSize: "8.5" },
    } as Partial<VoiceoverSettings>);
    const shoes = buildVoiceoverPrompt(signals({ title: "Trail Running Sneakers" }), vo);
    expect(shoes).toContain("Creator fit & styling");
    expect(shoes).toContain("Shoe size: 8.5");
    // Shoes pull shoe size, not height.
    expect(shoes).not.toContain("Height: 5'6");

    const kitchen = buildVoiceoverPrompt(signals(), vo);
    expect(kitchen).not.toContain("Creator fit & styling");
  });

  it("falls back to defaults for unknown stored enum values and clamps length", () => {
    const prompt = buildVoiceoverPrompt(
      signals(),
      voiceover({
        defaults: {
          lengthSeconds: 500,
          videoType: "not-a-type",
          hookStyle: "not-a-hook",
          pacing: "not-a-pace",
          disclosureKey: "not-a-key",
        },
      } as never),
    );
    expect(prompt).toContain(`Type: ${VIDEO_TYPE_LABELS["social-hook"]}`);
    expect(prompt).toContain(HOOK_STYLE_DIRECTIVES.relatable);
    expect(prompt).toContain(PACING_DIRECTIVES.standard);
    expect(prompt).toContain(DISCLOSURE_DIRECTIVES["honest-paid-sample"]);
    expect(prompt).toContain("approximately 120 seconds spoken (~300 words)");
  });

  it("carries the target length formula (~2.5 words per second)", () => {
    const prompt = buildVoiceoverPrompt(
      signals(),
      voiceover({ defaults: { lengthSeconds: 60 } } as never),
    );
    expect(prompt).toContain("approximately 60 seconds spoken (~150 words)");
  });
});

describe("directive text", () => {
  it("contains no em or en dashes anywhere (the build fails on U+2014)", () => {
    const all = [
      ...Object.values(VIDEO_TYPE_DIRECTIVES),
      ...Object.values(VIDEO_TYPE_LABELS),
      ...Object.values(HOOK_STYLE_DIRECTIVES),
      ...Object.values(PACING_DIRECTIVES),
      ...Object.values(DISCLOSURE_DIRECTIVES),
    ].join("\n");
    // Built from char codes so this file itself never contains the characters.
    const dashRe = new RegExp("[" + String.fromCharCode(0x2013, 0x2014) + "]");
    expect(all).not.toMatch(dashRe);
  });
});

describe("findDeniedBrand", () => {
  it("matches case-insensitively and ignores blank or 1-char entries", () => {
    expect(findDeniedBrand("I love my dyson vacuum", ["Dyson"])).toBe("Dyson");
    expect(findDeniedBrand("Great blender", ["Dyson", "Shark"])).toBeNull();
    expect(findDeniedBrand("An a-grade product", ["a", " ", ""])).toBeNull();
  });
});
