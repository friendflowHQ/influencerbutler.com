// Shopper-generation estimator: TypeScript port of the desktop's
// src/shared/shopper-generation.js. Turns product-page signals (breadcrumb,
// title, price, review count) into a "likely shopper" generation mix, then
// ranks the content formats that mix responds to (long demo video vs short
// vertical video vs photo vs idea list vs Facebook post). Amazon exposes no
// buyer ages, so every result is an estimate with a confidence level.
//
// The rules JSON is a byte-identical copy of the desktop's (synced by the
// desktop's `npm run sync:shopper-rules`), and shopper-generation.test.ts
// replays the desktop's golden fixtures, so the two ports cannot drift.
// Keep the arithmetic in the same order as the JS so results match exactly.

import RULES from "./shopper-generation-rules.json";

export type Generation = "boomer" | "genx" | "millennial" | "genz";
export type Mix = Record<Generation, number>;
export type Confidence = "low" | "medium" | "high";
export type FormatId =
  | "long-demo-video"
  | "short-vertical-video"
  | "aesthetic-photo"
  | "idea-list"
  | "facebook-post";

export type ShopperProduct = {
  categoryPath?: string | null;
  category?: string | null;
  title?: string | null;
  priceCents?: number | null;
  price?: number | string | null;
  reviewCount?: number | null;
};

export type ShopperEstimate = {
  mix: Mix;
  primary: Generation;
  confidence: Confidence;
  reasons: string[];
  categoryId: string;
  matchedOn: "category" | "title" | "none";
};

export type RankedFormat = {
  id: FormatId;
  score: number;
  coverage: string;
  length: string;
  platforms: string[];
};

type Rule = { id: string; keywords: string[]; lean: Record<string, number> };
type Band = { min?: number; max?: number; olderShift: number; reason: string };

export const GENERATIONS: Generation[] = RULES.generations as Generation[];
const OLDER: Generation[] = ["boomer", "genx"];
const YOUNGER: Generation[] = ["millennial", "genz"];

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeMix(raw: Partial<Record<string, unknown>> | null | undefined): Mix | null {
  if (!raw || typeof raw !== "object") return null;
  let total = 0;
  const out = {} as Mix;
  for (const gen of GENERATIONS) {
    const v = toFiniteNumber(raw[gen]);
    out[gen] = v != null && v > 0 ? v : 0;
    total += out[gen];
  }
  if (!(total > 0)) return null;
  for (const gen of GENERATIONS) out[gen] = out[gen] / total;
  return out;
}

function blend(a: Mix, b: Mix, weightB: number): Mix {
  const out = {} as Mix;
  for (const gen of GENERATIONS) out[gen] = a[gen] * (1 - weightB) + b[gen] * weightB;
  return out;
}

export function shiftOlder(mix: Mix, delta: number): Mix {
  if (!delta) return mix;
  const from = delta > 0 ? YOUNGER : OLDER;
  const to = delta > 0 ? OLDER : YOUNGER;
  const fromTotal = from.reduce((s, g) => s + mix[g], 0);
  const toTotal = to.reduce((s, g) => s + mix[g], 0);
  const amount = Math.min(Math.abs(delta), fromTotal);
  if (!(amount > 0)) return mix;
  const out = { ...mix };
  for (const g of from) out[g] = mix[g] - amount * (fromTotal > 0 ? mix[g] / fromTotal : 0);
  for (const g of to) out[g] = mix[g] + amount * (toTotal > 0 ? mix[g] / toTotal : 1 / to.length);
  return out;
}

const padText = (value: unknown): string => ` ${String(value || "").toLowerCase().replace(/\s+/g, " ")} `;

export function matchCategory(text: string): Rule | null {
  if (!text || !text.trim()) return null;
  let best: { rule: Rule; score: number } | null = null;
  for (const rule of RULES.categories as Rule[]) {
    for (const kw of rule.keywords) {
      if (text.includes(kw.toLowerCase()) && (!best || kw.length > best.score)) {
        best = { rule, score: kw.length };
      }
    }
  }
  return best ? best.rule : null;
}

function pickPrimary(mix: Mix): Generation {
  let primary = GENERATIONS[0]!;
  for (const gen of GENERATIONS) if (mix[gen] > mix[primary]) primary = gen;
  return primary;
}

function applyBands(bands: Band[], value: number | null): Band | null {
  if (value == null) return null;
  for (const band of bands) {
    const okMin = band.min == null || value >= band.min;
    const okMax = band.max == null || value <= band.max;
    if (okMin && okMax) return band;
  }
  return null;
}

export function inferShopperMix(
  product: ShopperProduct | null | undefined,
  creatorProfile?: Partial<Record<Generation, number>> | null,
): ShopperEstimate {
  const p: ShopperProduct = product && typeof product === "object" ? product : {};
  const reasons: string[] = [];
  let mix: Mix = { ...(RULES.neutral as Mix) };
  let matchedOn: ShopperEstimate["matchedOn"] = "none";
  let categoryId = "";

  // Narrowest breadcrumb segment first: "Walkers" beats "Health & Household".
  const segments = [p.category, ...String(p.categoryPath || "").split(/\s*[/>›]\s*/).reverse()]
    .filter((s): s is string => !!s && !!String(s).trim());
  let rule: Rule | null = null;
  for (const seg of segments) {
    rule = matchCategory(padText(seg));
    if (rule) break;
  }
  if (!rule && segments.length) rule = matchCategory(padText(segments.join(" / ")));
  if (rule) {
    matchedOn = "category";
  } else {
    rule = matchCategory(padText(p.title));
    if (rule) matchedOn = "title";
  }
  if (rule) {
    categoryId = rule.id;
    const lean = normalizeMix(rule.lean)!;
    mix = matchedOn === "category" ? lean : blend(mix, lean, RULES.titleMatchWeight);
    reasons.push(matchedOn === "category" ? "categoryLean" : "titleLean");
  }

  let priceCents = toFiniteNumber(p.priceCents);
  if (priceCents == null) {
    const dollars = toFiniteNumber(p.price);
    if (dollars != null) priceCents = Math.round(dollars * 100);
  }
  const priceBand = applyBands(RULES.modifiers.priceCents as Band[], priceCents);
  if (priceBand) {
    mix = shiftOlder(mix, priceBand.olderShift);
    reasons.push(priceBand.reason);
  }
  const reviewBand = applyBands(RULES.modifiers.reviewCount as Band[], toFiniteNumber(p.reviewCount));
  if (reviewBand) {
    mix = shiftOlder(mix, reviewBand.olderShift);
    reasons.push(reviewBand.reason);
  }

  const profile = normalizeMix(creatorProfile);
  if (profile) {
    mix = blend(mix, profile, RULES.profileBlendWeight);
    reasons.push("creatorAudience");
  }

  mix = normalizeMix(mix)!;
  const primary = pickPrimary(mix);
  let confidence: Confidence = "low";
  if (matchedOn === "category") {
    confidence = mix[primary] >= RULES.confidence.highPrimaryShare ? "high" : "medium";
  } else if (matchedOn === "title") {
    confidence = "medium";
  }
  const rounded = {} as Mix;
  for (const gen of GENERATIONS) rounded[gen] = round3(mix[gen]);
  return { mix: rounded, primary, confidence, reasons, categoryId, matchedOn };
}

export function recommendFormats(mix: Partial<Record<Generation, number>> | null | undefined): RankedFormat[] {
  const m = normalizeMix(mix) || ({ ...RULES.neutral } as Mix);
  return RULES.formats
    .map((f) => ({
      id: f.id as FormatId,
      score: round3(GENERATIONS.reduce((s, g) => s + m[g] * ((f.weights as Record<string, number>)[g] || 0), 0)),
      coverage: f.coverage,
      length: f.length,
      platforms: f.platforms.slice(),
    }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
