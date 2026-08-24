import { ENDPOINTS } from "../shared/constants";
import { getIntegration, getState } from "../storage/store";
import { getMarketBatch } from "./market";
import { openaiComplete } from "./integrations";
import { buildBriefPrompt, parseBriefSections } from "../tools/campaign-radar/brief-prompt";
import type {
  CampaignBriefDemand,
  CampaignBriefResult,
  CampaignBriefSignals,
  CampaignBriefSections,
  MarketProduct,
} from "../shared/messages";

// Campaign Butler ("The Butler's Brief"). The grid overlay computes the score +
// confidence locally and sends the campaign signals here; the content script
// cannot hold the license key or hit our origin. This worker helper resolves the
// standout product's demand from the shared catalogue, then POSTs everything to
// /api/extension/campaign-brief for the reasoning prose. The numbers stay local
// and honest; only the prose comes from the model.

const EMPTY: CampaignBriefResult = { ok: false, sections: null, demand: null };

// Pick the campaign's standout product from the catalogue rows: highest
// estimated monthly REVENUE (units * price) first, since a $40 product at 600
// units/month is a better first bet than a $6 one at the same volume; fall back
// to units, then to Amazon's real bought-past-month, then the first row.
function pickStandout(products: MarketProduct[]): CampaignBriefDemand | null {
  if (products.length === 0) return null;
  const revenue = (p: MarketProduct): number | null =>
    p.estMonthlySales !== null && p.priceCents !== null ? p.estMonthlySales * p.priceCents : null;
  const score = (p: MarketProduct): number =>
    revenue(p) ?? (p.estMonthlySales !== null ? p.estMonthlySales * 100 : null) ?? p.boughtPastMonth ?? -1;
  const best = products.reduce((a, b) => (score(b) > score(a) ? b : a));
  return {
    asin: best.asin,
    estMonthlySales: best.estMonthlySales,
    estMonthlyRevenueCents: revenue(best),
    boughtPastMonth: best.boughtPastMonth,
    priceCents: best.priceCents,
    category: best.categoryLabel ?? best.bsrCategory,
    calibrated: best.estimateCalibrated,
  };
}

// When the creator has connected their own OpenAI key in API Integrations, write
// the brief with it directly (their key, their cost) instead of our server. The
// prose is built and parsed locally; a miss (not connected, OpenAI error, or an
// unparseable reply) returns null so the caller falls back to the server route.
async function tryLocalOpenAiBrief(
  signals: CampaignBriefSignals,
  demand: CampaignBriefDemand | null,
): Promise<CampaignBriefSections | null> {
  const openai = await getIntegration("openai");
  if (!openai.credentialsEnc) return null; // no BYO key: use the server route
  const res = await openaiComplete(buildBriefPrompt(signals, demand));
  if (!res.ok || !res.text) return null;
  return parseBriefSections(res.text);
}

export async function fetchCampaignBrief(
  signals: CampaignBriefSignals,
): Promise<CampaignBriefResult> {
  const state = await getState();
  const key = state.auth.licenseKey;
  if (!key) return { ...EMPTY, error: "Sign in to use Campaign Butler." };

  // Resolve the standout product's demand first, so the brief can talk about
  // real units/revenue. A miss (fresh catalogue, no grid-level ASINs, or an
  // unapplied migration) simply leaves demand null and the brief leans on the
  // commission / budget / brand signals instead (estimator-first, degrades).
  let demand: CampaignBriefDemand | null = null;
  let migrationPending = false;
  if (signals.asins.length > 0) {
    const market = await getMarketBatch(signals.asins, signals.marketplace);
    if (market.migrationPending) migrationPending = true;
    demand = pickStandout(market.products);
  }

  // BYO key first: write the prose with the creator's own OpenAI integration.
  // Only when they have not connected one do we spend our server's model budget.
  const local = await tryLocalOpenAiBrief(signals, demand);
  if (local) return { ok: true, migrationPending, sections: local, demand };

  try {
    const res = await fetch(ENDPOINTS.campaignBrief, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        brand: signals.brand,
        commissionRatePct: signals.commissionRatePct,
        remainingBudgetCents: signals.remainingBudgetCents,
        daysRemaining: signals.daysRemaining,
        slotsFilled: signals.slotsFilled,
        slotsTotal: signals.slotsTotal,
        fullyClaimed: signals.fullyClaimed,
        score: signals.score,
        band: signals.band,
        confidence: signals.confidence,
        ccStats: signals.ccStats,
        demand,
        locale: signals.locale ?? null,
      }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; sections?: CampaignBriefSections | null; error?: string }
      | null;
    if (!res.ok || !data || !data.ok) {
      const error = res.status === 429 ? "Slow down a moment, then try again." : "Could not reach Campaign Butler.";
      return { ok: false, migrationPending, sections: null, demand, error: data?.error ?? error };
    }
    return { ok: true, migrationPending, sections: data.sections ?? null, demand };
  } catch {
    return { ...EMPTY, migrationPending, demand, error: "Network error reaching Campaign Butler." };
  }
}
