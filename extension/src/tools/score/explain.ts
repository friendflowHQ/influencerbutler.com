import { WEIGHTS, type ButlerScore } from "./model";

// Plain-language reasons a product ranks where it does, derived from the
// Butler Score's own weighted parts (no new scoring). A part only counts as a
// reason when it is clearly strong; a part sitting at exactly half weight is the
// score's "unknown" neutral and is never claimed as a strength.

type Part = "commission" | "slot" | "demand" | "price" | "campaign";

// Availability is skipped: "in stock" is expected, not a reason to rank first.
const REASON_PARTS: Part[] = ["commission", "slot", "demand", "campaign", "price"];

const STRONG_UNIT = 0.75;
const MIN_SCORE_FOR_REASON = 40;

type ExplainCopy = {
  phrases: Record<Part, string>;
  estimated: string;
  topPick: string;
  why: (reasons: string) => string;
};

const EN: ExplainCopy = {
  phrases: {
    commission: "high commission",
    slot: "open video slot",
    demand: "sells well",
    price: "good price point",
    campaign: "open campaign",
  },
  estimated: "(estimated)",
  topPick: "Top pick",
  why: (reasons) => `Why is this first? ${reasons}`,
};
const ES: ExplainCopy = {
  phrases: {
    commission: "comision alta",
    slot: "espacio de video libre",
    demand: "se vende bien",
    price: "buen precio",
    campaign: "campana abierta",
  },
  estimated: "(estimado)",
  topPick: "Mejor opcion",
  why: (reasons) => `Por que va primero? ${reasons}`,
};
const FR: ExplainCopy = {
  phrases: {
    commission: "commission elevee",
    slot: "place video libre",
    demand: "se vend bien",
    price: "bon prix",
    campaign: "campagne ouverte",
  },
  estimated: "(estime)",
  topPick: "Meilleur choix",
  why: (reasons) => `Pourquoi en premier ? ${reasons}`,
};

export function explainCopy(locale: string): ExplainCopy {
  if (locale.startsWith("es")) return ES;
  if (locale.startsWith("fr")) return FR;
  return EN;
}

// Up to two part names, strongest first, that make this score look good.
export function topReasons(score: ButlerScore): Part[] {
  if (score.score < MIN_SCORE_FOR_REASON) return [];
  return REASON_PARTS.map((part) => ({ part, points: score.parts[part], unit: score.parts[part] / WEIGHTS[part] }))
    .filter((p) => p.unit >= STRONG_UNIT && Math.abs(p.unit - 0.5) > 1e-9)
    .sort((a, b) => b.points - a.points)
    .slice(0, 2)
    .map((p) => p.part);
}

// "high commission, open campaign (estimated)", or "" when nothing stands out.
export function explainScore(score: ButlerScore, opts: { estimated: boolean; locale: string }): string {
  const copy = explainCopy(opts.locale);
  const reasons = topReasons(score).map((part) => copy.phrases[part]);
  if (reasons.length === 0) return "";
  return opts.estimated ? `${reasons.join(", ")} ${copy.estimated}` : reasons.join(", ");
}
