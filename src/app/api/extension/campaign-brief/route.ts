/**
 * /api/extension/campaign-brief - Campaign Butler's per-campaign advisory.
 *
 * POST (Bearer license key): one Creator Connections campaign's structured
 * signals (commission, budget, runway, fill, the locally-computed score +
 * confidence, any captured CC stats, and our catalogue demand for the standout
 * product) -> a short butler-voiced brief (verdict, why-take, what-to-film, best
 * product reason, onsite verdict, offsite angles, audiences).
 *
 * The score and confidence are decided in the extension and passed in; this route
 * only writes the reasoning prose (see src/lib/campaign-brief.ts). It returns
 * { ok: true, sections: null } when no LLM key is configured or the call fails,
 * so the panel degrades to the local score breakdown rather than erroring.
 *
 * Open to any signed-in license (all tiers), so it carries a light per-user rate
 * limit as the only cost control (the panel is on-demand, one call per click).
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";
import {
  generateCampaignBrief,
  type CampaignBriefBand,
  type CampaignBriefInput,
  type CampaignCcStats,
  type CampaignBriefDemand,
} from "@/lib/campaign-brief";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

// Best-effort per-user rate limit. This is an in-memory sliding window, so it
// only bounds a single warm serverless instance rather than the whole fleet, but
// that is enough to stop a runaway loop from one client hammering the model. The
// panel is on-demand (one call per user click), so the ceiling is generous.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();

function rateLimited(userId: string, now: number): boolean {
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  hits.set(userId, recent);
  // Opportunistic cleanup so the map cannot grow without bound on a long-lived
  // instance: drop other users whose window has fully elapsed.
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) hits.delete(k);
  }
  return recent.length > RATE_MAX;
}

// ---- Input coercion ---------------------------------------------------------

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function boolOrNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function str(v: unknown, max: number): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function coerceBand(v: unknown): CampaignBriefBand {
  return v === "hot" || v === "warm" || v === "cool" ? v : "cool";
}

function coerceStats(v: unknown): CampaignCcStats | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const stats: CampaignCcStats = {
    ordersLast30: num(o.ordersLast30),
    salesLast30Cents: num(o.salesLast30Cents),
    roas: num(o.roas),
    ordersTotal: num(o.ordersTotal),
  };
  const any =
    stats.ordersLast30 !== null ||
    stats.salesLast30Cents !== null ||
    stats.roas !== null ||
    stats.ordersTotal !== null;
  return any ? stats : null;
}

function coerceDemand(v: unknown): CampaignBriefDemand | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const asin = str(o.asin, 10);
  if (!asin) return null;
  return {
    asin: asin.toUpperCase(),
    estMonthlySales: num(o.estMonthlySales),
    estMonthlyRevenueCents: num(o.estMonthlyRevenueCents),
    boughtPastMonth: num(o.boughtPastMonth),
    priceCents: num(o.priceCents),
    category: str(o.category, 120),
    calibrated: o.calibrated === true,
  };
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  if (rateLimited(auth.auth.userId, Date.now())) {
    return jsonWithCors({ ok: false, error: "Too many requests" }, 429);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const b = (body ?? {}) as Record<string, unknown>;

  const input: CampaignBriefInput = {
    brand: str(b.brand, 160),
    commissionRatePct: num(b.commissionRatePct),
    remainingBudgetCents: num(b.remainingBudgetCents),
    daysRemaining: num(b.daysRemaining),
    slotsFilled: num(b.slotsFilled),
    slotsTotal: num(b.slotsTotal),
    fullyClaimed: boolOrNull(b.fullyClaimed),
    score: Math.max(0, Math.min(100, num(b.score) ?? 0)),
    band: coerceBand(b.band),
    confidence: Math.max(0, Math.min(100, num(b.confidence) ?? 0)),
    ccStats: coerceStats(b.ccStats),
    demand: coerceDemand(b.demand),
    locale: str(b.locale, 12),
  };

  // `diag` is a short, non-sensitive reason the brief was empty (e.g. "groq-400",
  // "no-provider", "groq-parse-fail"); null on success. It rides in the response
  // and the server logs so an empty brief can be diagnosed without guessing.
  const { sections, diag } = await generateCampaignBrief(input);
  if (!sections) console.warn("[campaign-brief] empty brief", { diag, brand: input.brand });
  return jsonWithCors({ ok: true, sections, diag });
}
