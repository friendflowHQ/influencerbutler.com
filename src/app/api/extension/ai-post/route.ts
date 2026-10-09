/**
 * POST /api/extension/ai-post - "Your AI Post is ready" for the Chrome extension's
 * product popup (and, via /api/desktop/ai-post, the desktop app's Deals Butler).
 * Bearer license key. Free ("Influencer Butler AI"), same engine tier as
 * /api/extension/social-caption.
 *
 * Body: {
 *   facts: { title, store, brand, percentOff, couponPercentOff, promoPercentOff,
 *            promoCode, promoText, event, dealEndsIn, salePrice, originalPrice,
 *            stars, reviews },
 *   formula?: { id, name, post, comment },   // creator's formula, {{tokens}} allowed
 *   skeleton?: string,                       // OR already-rendered text (desktop)
 *   tone?, locale?, variant?: number, previous?: string[]
 * }
 * Returns: { ok: true, post, comment, source: "ai" | "formula", diag }. `post` keeps
 * the literal `{{url}}` placeholder for the client to swap for its own affiliate
 * link. `source: "formula"` means the plain rendered formula (no model / guard hit).
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";
import { generateAiPost, type AiPostFacts, type AiPostFormula } from "@/lib/ai-post";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

function str(v: unknown, max = 300): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseFacts(raw: unknown): AiPostFacts {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    title: str(o.title, 200),
    store: str(o.store, 30),
    brand: str(o.brand, 80),
    percentOff: num(o.percentOff),
    couponPercentOff: num(o.couponPercentOff),
    promoPercentOff: num(o.promoPercentOff),
    promoCode: str(o.promoCode, 40),
    promoText: str(o.promoText, 160),
    event: str(o.event, 80),
    dealEndsIn: str(o.dealEndsIn, 40),
    salePrice: str(o.salePrice, 24),
    originalPrice: str(o.originalPrice, 24),
    stars: num(o.stars),
    reviews: num(o.reviews),
  };
}

function parseFormula(raw: unknown): AiPostFormula | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const post = str(o.post, 1500);
  if (!post) return null;
  return { id: str(o.id, 80), name: str(o.name, 80), post, comment: str(o.comment, 400) };
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const previous = Array.isArray(o.previous)
    ? o.previous.map((p) => str(p, 600)).filter((p): p is string => !!p).slice(-3)
    : [];

  const outcome = await generateAiPost({
    facts: parseFacts(o.facts),
    formula: parseFormula(o.formula),
    skeleton: str(o.skeleton, 1200),
    tone: str(o.tone, 30),
    locale: str(o.locale, 20),
    variant: num(o.variant),
    previous,
  });

  if (!outcome) {
    return jsonWithCors({ ok: false, error: "Add a formula or some text to build the post from" }, 400);
  }
  return jsonWithCors({
    ok: true,
    post: outcome.post,
    comment: outcome.comment,
    source: outcome.source,
    diag: outcome.diag,
  });
}
