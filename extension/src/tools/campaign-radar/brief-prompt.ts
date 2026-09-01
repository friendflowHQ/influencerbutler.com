import type {
  CampaignBriefDemand,
  CampaignBriefSections,
  CampaignBriefSignals,
} from "../../shared/messages";

// Local (extension-side) port of the Campaign Butler brief prompt + parser, used
// when the creator has connected their own OpenAI key in API Integrations. The
// extension build cannot import the server module (src/lib/campaign-brief.ts:
// separate tsconfig, no @/ alias), so the prompt and the JSON normalizer are
// duplicated here. Keep this in sync with SYSTEM_PROMPT / buildUserPrompt /
// normalize on the server; the server remains the fallback when no key is set.
//
// The OpenAI adapter's complete() takes a single user message (no system/user
// split and no json_object response_format), so the system instructions are
// folded into the prompt and the JSON is parsed defensively from the reply.

// The instruction block (mirrors the server SYSTEM_PROMPT). Folded into the one
// prompt the adapter sends.
const INSTRUCTIONS = [
  "You are Campaign Butler, the campaign advisor inside Influencer Butler (an app",
  "for Amazon influencers). A creator is looking at one Amazon Creator Connections",
  "campaign and wants your read on whether to accept it and what to film. You are",
  "given the campaign's real numbers plus a score (0-100) and a confidence (0-100)",
  "that were already computed for you: treat those as fixed truth, never restate a",
  "different score, and ground every claim in the numbers provided.",
  "Speak like a sharp, warm butler: concise, plain English, practical. Do NOT",
  "invent data you were not given (no made-up order counts, prices, or ROAS). If a",
  "number is missing, reason from what you do have and say what is unknown.",
  "Never use em dashes; use a colon for a label and its description, or a hyphen or",
  "comma for a break in a sentence.",
  "Respond ONLY with a JSON object of this exact shape, no prose around it and no",
  "code fences:",
  '{"verdictWord": string, "whyTake": string[], "whatToFilm": string[],',
  '"pickReason": string | null, "onAmazon": string, "offAmazon": string[],',
  '"audiences": string[]}.',
  "verdictWord: 2-4 words matching the score band (hot => take it, warm => worth a",
  "look, cool => probably pass). whyTake: 2-4 short bullets. whatToFilm: 2-4 onsite",
  "shoppable angles specific to this product. pickReason: one sentence on why the",
  "standout product is the best first bet, or null if no product demand was given.",
  "onAmazon: 2-3 sentence onsite verdict. offAmazon: 2-4 social content angles.",
  "audiences: 3-6 short audience labels. Use empty arrays where you have nothing.",
].join(" ");

function dollars(cents: number | null): string {
  if (cents === null) return "unknown";
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Render the campaign signals as a compact, labelled block (mirrors the server
// buildUserPrompt). Missing signals are stated as "unknown" rather than omitted,
// so the model knows what it lacks.
function buildSignalBlock(
  signals: CampaignBriefSignals,
  demand: CampaignBriefDemand | null,
): string {
  const lines: string[] = [];
  lines.push(`Brand: ${signals.brand ?? "unknown"}`);
  lines.push(
    `Commission rate: ${signals.commissionRatePct === null ? "unknown" : `${signals.commissionRatePct}%`}`,
  );
  lines.push(`Remaining budget: ${dollars(signals.remainingBudgetCents)}`);
  lines.push(
    `Days of runway left: ${signals.daysRemaining === null ? "unknown" : signals.daysRemaining}`,
  );
  if (signals.slotsTotal !== null) {
    lines.push(
      `Creator slots: ${signals.slotsFilled ?? "?"} of ${signals.slotsTotal} claimed` +
        (signals.fullyClaimed ? " (fully claimed, can no longer be accepted)" : ""),
    );
  }
  lines.push(`Butler score: ${signals.score}/100 (band: ${signals.band})`);
  lines.push(`Confidence in this read: ${signals.confidence}/100`);

  if (signals.ccStats) {
    const s = signals.ccStats;
    const parts: string[] = [];
    if (s.ordersLast30 !== null) parts.push(`${s.ordersLast30} orders in the last 30 days`);
    if (s.salesLast30Cents !== null)
      parts.push(`${dollars(s.salesLast30Cents)} sales in the last 30 days`);
    if (s.roas !== null) parts.push(`ROAS ${s.roas}`);
    if (s.ordersTotal !== null) parts.push(`${s.ordersTotal} orders tracked in campaign history`);
    if (parts.length) lines.push(`Campaign performance (from Amazon): ${parts.join(", ")}`);
  }

  if (demand) {
    const parts: string[] = [`ASIN ${demand.asin}`];
    if (demand.priceCents !== null) parts.push(`price ${dollars(demand.priceCents)}`);
    if (demand.boughtPastMonth !== null)
      parts.push(`${demand.boughtPastMonth}+ bought in the past month (Amazon's own figure)`);
    if (demand.estMonthlySales !== null)
      parts.push(`estimated ${Math.round(demand.estMonthlySales)} units/month`);
    if (demand.estMonthlyRevenueCents !== null)
      parts.push(`estimated ${dollars(demand.estMonthlyRevenueCents)}/month revenue`);
    if (demand.category) parts.push(`category ${demand.category}`);
    if (demand.videoCount !== null)
      parts.push(
        `${demand.videoCount} creator videos already on this product (saturation: fewer means less competition)`,
      );
    parts.push(
      demand.calibrated
        ? "(estimate calibrated from real data)"
        : "(estimate from a seed curve, less certain)",
    );
    lines.push(`Standout product demand (our catalogue): ${parts.join(", ")}`);
  } else {
    lines.push(
      "Standout product demand: unknown (no product in our catalogue for this campaign).",
    );
  }

  if (signals.locale) lines.push(`Write your answer in this language: ${signals.locale}.`);
  return lines.join("\n");
}

// The single prompt string handed to the OpenAI adapter's complete().
export function buildBriefPrompt(
  signals: CampaignBriefSignals,
  demand: CampaignBriefDemand | null,
): string {
  return `${INSTRUCTIONS}\n\nCampaign:\n${buildSignalBlock(signals, demand)}`;
}

const MAX_ITEMS = 8;
const MAX_ITEM_LEN = 240;

function cleanArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((x) => String(x).trim().slice(0, MAX_ITEM_LEN))
    .filter(Boolean)
    .slice(0, MAX_ITEMS);
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

// Strip a fenced ```json ... ``` (or bare ``` ... ```) wrapper the model may add
// despite being asked not to, so JSON.parse sees just the object.
function stripFences(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const inner = fence?.[1];
  return inner !== undefined ? inner.trim() : trimmed;
}

// Parse and normalize the model's reply into brief sections. Returns null when
// the reply is not valid JSON, so the caller can fall back to the server route
// or the local score breakdown. Mirrors the server normalize().
export function parseBriefSections(text: string): CampaignBriefSections | null {
  let raw: unknown;
  try {
    raw = JSON.parse(stripFences(text));
  } catch {
    return null;
  }
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = o.pickReason;
  return {
    verdictWord: cleanText(o.verdictWord, 40),
    whyTake: cleanArray(o.whyTake),
    whatToFilm: cleanArray(o.whatToFilm),
    pickReason:
      typeof pick === "string" && pick.trim() ? pick.trim().slice(0, MAX_ITEM_LEN) : null,
    onAmazon: cleanText(o.onAmazon, 800),
    offAmazon: cleanArray(o.offAmazon),
    audiences: cleanArray(o.audiences),
  };
}
