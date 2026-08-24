/**
 * Campaign Butler: turn a Creator Connections campaign's structured signals into
 * a short, butler-voiced advisory ("The Butler's Brief"). This is our answer to a
 * competitor's per-campaign AI verdict panel, in our own wording.
 *
 * Design: the numbers are decided elsewhere. The 0-100 score and the confidence
 * are computed locally in the extension (deterministic, explainable), and the
 * best-product demand estimate comes from our shared catalogue. This module only
 * writes the reasoning PROSE around those numbers, so the model can never invent
 * a misleading score. On any failure it returns null and the panel falls back to
 * the local score breakdown.
 *
 * Provider is the same Groq-first / OpenAI-fallback resolver the AI concierge and
 * ai-notes use (both speak the OpenAI-compatible chat/completions API). Override
 * the model with CAMPAIGN_BRIEF_MODEL. Groq's model is near-free; a full brief is
 * a single non-streaming JSON call.
 */
import { resolveTextProvider, openAiFallbackProvider } from "@/lib/ai-concierge/llm";

export type CampaignBriefBand = "hot" | "warm" | "cool";

// Captured Creator Connections conversion stats, when Amazon actually exposes
// them on the campaign record. Estimator-first: these are usually null, and the
// brief leans on `demand` (our own catalogue estimate) as the proof-of-demand.
export type CampaignCcStats = {
  ordersLast30: number | null;
  salesLast30Cents: number | null;
  roas: number | null;
  ordersTotal: number | null;
};

// Our own demand read for the campaign's standout product, from the shared
// catalogue ("internal Keepa"). estMonthlyRevenueCents = estMonthlySales * price.
export type CampaignBriefDemand = {
  asin: string;
  estMonthlySales: number | null;
  estMonthlyRevenueCents: number | null;
  boughtPastMonth: number | null;
  priceCents: number | null;
  category: string | null;
  calibrated: boolean;
};

export type CampaignBriefInput = {
  brand: string | null;
  commissionRatePct: number | null;
  remainingBudgetCents: number | null;
  daysRemaining: number | null;
  slotsFilled: number | null;
  slotsTotal: number | null;
  fullyClaimed: boolean | null;
  // The local, deterministic score and confidence (0-100) the extension computed.
  score: number;
  band: CampaignBriefBand;
  confidence: number;
  ccStats: CampaignCcStats | null;
  demand: CampaignBriefDemand | null;
  // BCP-47-ish locale hint so the butler answers in the creator's language.
  locale?: string | null;
};

// The prose sections the model writes, each grounded in the supplied numbers.
export type CampaignBriefSections = {
  // A short verdict phrase in the butler's voice, e.g. "Worth accepting".
  verdictWord: string;
  // Why the creator would take this campaign (commission, demand, budget, brand).
  whyTake: string[];
  // Onsite (Amazon) shoppable-video angles to film.
  whatToFilm: string[];
  // Why the standout product is the best first bet (null when no demand data).
  pickReason: string | null;
  // The onsite verdict paragraph.
  onAmazon: string;
  // Offsite (social) content angles.
  offAmazon: string[];
  // Who the product is for (audiences to aim the content at).
  audiences: string[];
};

export function isCampaignBriefConfigured(): boolean {
  return resolveTextProvider() !== null;
}

// The outcome of a brief generation attempt. On success `sections` is set and
// `diag` is null. On any miss `sections` is null and `diag` is a short,
// non-sensitive reason ("no-provider", "groq-400", "openai-500", "groq-empty",
// "groq-parse-fail", "groq-threw", ...) so the route and logs can say WHY the
// brief was empty instead of collapsing every failure into a blank fallback.
export type CampaignBriefOutcome = {
  sections: CampaignBriefSections | null;
  diag: string | null;
};

const SYSTEM_PROMPT = [
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
  "Respond ONLY with a JSON object of this exact shape:",
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

// Render the input as a compact, labelled block for the model. Missing signals
// are stated as "unknown" rather than omitted, so the model knows what it lacks.
function buildUserPrompt(input: CampaignBriefInput): string {
  const lines: string[] = [];
  lines.push(`Brand: ${input.brand ?? "unknown"}`);
  lines.push(
    `Commission rate: ${input.commissionRatePct === null ? "unknown" : `${input.commissionRatePct}%`}`,
  );
  lines.push(`Remaining budget: ${dollars(input.remainingBudgetCents)}`);
  lines.push(
    `Days of runway left: ${input.daysRemaining === null ? "unknown" : input.daysRemaining}`,
  );
  if (input.slotsTotal !== null) {
    lines.push(
      `Creator slots: ${input.slotsFilled ?? "?"} of ${input.slotsTotal} claimed` +
        (input.fullyClaimed ? " (fully claimed, can no longer be accepted)" : ""),
    );
  }
  lines.push(`Butler score: ${input.score}/100 (band: ${input.band})`);
  lines.push(`Confidence in this read: ${input.confidence}/100`);

  if (input.ccStats) {
    const s = input.ccStats;
    const parts: string[] = [];
    if (s.ordersLast30 !== null) parts.push(`${s.ordersLast30} orders in the last 30 days`);
    if (s.salesLast30Cents !== null) parts.push(`${dollars(s.salesLast30Cents)} sales in the last 30 days`);
    if (s.roas !== null) parts.push(`ROAS ${s.roas}`);
    if (s.ordersTotal !== null) parts.push(`${s.ordersTotal} orders tracked in campaign history`);
    if (parts.length) lines.push(`Campaign performance (from Amazon): ${parts.join(", ")}`);
  }

  if (input.demand) {
    const d = input.demand;
    const parts: string[] = [`ASIN ${d.asin}`];
    if (d.priceCents !== null) parts.push(`price ${dollars(d.priceCents)}`);
    if (d.boughtPastMonth !== null) parts.push(`${d.boughtPastMonth}+ bought in the past month (Amazon's own figure)`);
    if (d.estMonthlySales !== null) parts.push(`estimated ${Math.round(d.estMonthlySales)} units/month`);
    if (d.estMonthlyRevenueCents !== null) parts.push(`estimated ${dollars(d.estMonthlyRevenueCents)}/month revenue`);
    if (d.category) parts.push(`category ${d.category}`);
    parts.push(d.calibrated ? "(estimate calibrated from real data)" : "(estimate from a seed curve, less certain)");
    lines.push(`Standout product demand (our catalogue): ${parts.join(", ")}`);
  } else {
    lines.push("Standout product demand: unknown (no product in our catalogue for this campaign).");
  }

  if (input.locale) lines.push(`Write your answer in this language: ${input.locale}.`);
  return lines.join("\n");
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

function normalize(raw: unknown): CampaignBriefSections {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = o.pickReason;
  return {
    verdictWord: cleanText(o.verdictWord, 40),
    whyTake: cleanArray(o.whyTake),
    whatToFilm: cleanArray(o.whatToFilm),
    pickReason: typeof pick === "string" && pick.trim() ? pick.trim().slice(0, MAX_ITEM_LEN) : null,
    onAmazon: cleanText(o.onAmazon, 800),
    offAmazon: cleanArray(o.offAmazon),
    audiences: cleanArray(o.audiences),
  };
}

/**
 * Generate the butler's brief for one campaign. Never throws: returns a
 * CampaignBriefOutcome whose `sections` is null (with a `diag` reason) when no
 * LLM key is configured or the call fails, so the caller shows the local score
 * breakdown and the route can report why.
 */
export async function generateCampaignBrief(
  input: CampaignBriefInput,
): Promise<CampaignBriefOutcome> {
  const provider = resolveTextProvider();
  if (!provider) {
    console.warn("[campaign-brief] no GROQ_API_KEY / OPENAI_API_KEY configured");
    return { sections: null, diag: "no-provider" };
  }
  const model = process.env.CAMPAIGN_BRIEF_MODEL?.trim() || provider.model;
  const userPrompt = buildUserPrompt(input);

  // One provider attempt. Resolves to sections on success, or sections:null with
  // a diag reason on a non-retryable miss (400/500, empty reply, unparseable
  // JSON). A 429 rejects instead, so the caller's catch does the rate failover.
  const call = async (
    url: string,
    key: string,
    mdl: string,
    kind: "groq" | "openai",
  ): Promise<CampaignBriefOutcome> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: mdl,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[campaign-brief] chat", kind, mdl, res.status, detail.slice(0, 300));
      if (res.status === 429) return Promise.reject(new Error("rate"));
      return { sections: null, diag: `${kind}-${res.status}` };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { sections: null, diag: `${kind}-empty` };
    try {
      return { sections: normalize(JSON.parse(content)), diag: null };
    } catch {
      console.error("[campaign-brief] unparseable JSON", kind, mdl, content.slice(0, 200));
      return { sections: null, diag: `${kind}-parse-fail` };
    }
  };

  // Groq is tried first when configured. It can miss two ways: a 429 throws
  // ("rate"), while any other non-OK status (400/500, an empty reply, etc.)
  // resolves with sections:null + a diag. Both should fall over to OpenAI when
  // that key exists, so the fallback runs on a null-sections primary as well as
  // on a throw. Without this, a persistent Groq 400 (e.g. a decommissioned model
  // id) would silently return no brief even though OPENAI_API_KEY is set.
  const fallback = provider.kind === "groq" ? openAiFallbackProvider() : null;
  try {
    const primary = await call(provider.url, provider.key, model, provider.kind);
    if (primary.sections) return primary;
    if (fallback) return await call(fallback.url, fallback.key, fallback.model, fallback.kind);
    return primary;
  } catch (err) {
    if (fallback) {
      try {
        return await call(fallback.url, fallback.key, fallback.model, fallback.kind);
      } catch (err2) {
        console.error("[campaign-brief] fallback threw", err2);
        return { sections: null, diag: "openai-threw" };
      }
    }
    console.error("[campaign-brief] threw", err);
    return { sections: null, diag: provider.kind === "groq" ? "groq-threw" : "openai-threw" };
  }
}
