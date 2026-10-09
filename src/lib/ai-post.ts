/**
 * ai-post.ts - the "Your AI Post is ready" engine shared by the Chrome extension
 * (product-page popup) and the desktop app (Deals Butler). A creator keeps one or
 * more post FORMULAS (a layout with {{tokens}}, e.g. "{{lib:hook}}!\n{{title}}\n
 * {{percentOff}}% off"). This module:
 *
 *   1. renders the chosen formula against the product's real facts (the skeleton),
 *      eliding any line whose tokens have no data, exactly like the desktop's
 *      post-template-resolver does;
 *   2. asks the Groq-first / OpenAI-fallback model to rewrite that skeleton in the
 *      same structure with fresh wording (so Regenerate gives a new take);
 *   3. verifies the rewrite did not invent a number, a dollar price (Amazon is
 *      percent-only), or drop the promo code / link placeholder - and falls back to
 *      the plain skeleton when it did, or when no model is configured.
 *
 * Never throws. The affiliate link is NOT resolved here: `{{url}}` is kept as a
 * literal placeholder so each client substitutes the link it minted itself.
 */
import { resolveTextProvider, openAiFallbackProvider } from "@/lib/ai-concierge/llm";

export type AiPostFacts = {
  title?: string | null;
  // "Amazon" | "Walmart" | ... - labels the pinned comment and sets price policy.
  store?: string | null;
  brand?: string | null;
  // Base discount, whole percent.
  percentOff?: number | null;
  // Extra percent a shopper stacks with a clippable coupon / promo code.
  couponPercentOff?: number | null;
  promoPercentOff?: number | null;
  promoCode?: string | null;
  // Free-form promo line as read off the page ("Save 15% with coupon").
  promoText?: string | null;
  // Named sale event ("Prime Big Deal Days"), when the page shows one.
  event?: string | null;
  dealEndsIn?: string | null;
  // Exact prices. Only ever rendered for stores that allow them (not Amazon).
  salePrice?: string | null;
  originalPrice?: string | null;
  stars?: number | null;
  reviews?: number | null;
};

export type AiPostFormula = {
  id?: string | null;
  name?: string | null;
  post: string;
  // Pinned / first comment template, rendered deterministically (no AI).
  comment?: string | null;
};

export type AiPostInput = {
  facts: AiPostFacts;
  formula?: AiPostFormula | null;
  // Already-rendered text (the desktop resolves its own tokens). Used instead of
  // `formula.post` when present.
  skeleton?: string | null;
  tone?: string | null;
  locale?: string | null;
  // Bumps on every Regenerate so the model is nudged off its previous answer.
  variant?: number | null;
  previous?: string[] | null;
};

export type AiPostOutcome = {
  post: string;
  comment: string | null;
  // "ai" when the model rewrote the skeleton, "formula" when the plain rendered
  // formula was used (no provider, model miss, or the guard rejected the rewrite).
  source: "ai" | "formula";
  diag: string | null;
};

const URL_TOKEN = "{{url}}";
const MAX_POST_LEN = 1200;
const MAX_FORMULA_LEN = 1500;

/** Stores that allow exact prices in a post. Amazon's policy is percent-only. */
function allowsExactPrice(store: string | null | undefined): boolean {
  return !!store && !/amazon/i.test(store);
}

function clean(v: unknown, max = 300): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function pct(v: unknown): string {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 99 ? String(Math.round(v)) : "";
}

/** Value of one {{token}} for these facts ("" when there is no data). */
function tokenValue(name: string, f: AiPostFacts): string {
  const exact = allowsExactPrice(f.store);
  switch (name) {
    case "title":
      return clean(f.title, 140);
    case "brand":
      return clean(f.brand, 60);
    case "store":
      return clean(f.store, 30);
    case "percentOff":
      return pct(f.percentOff);
    case "couponPercentOff":
      return pct(f.couponPercentOff);
    case "promoPercentOff":
      return pct(f.promoPercentOff);
    case "totalPercentOff": {
      const total = [f.percentOff, f.couponPercentOff, f.promoPercentOff].reduce<number>(
        (s, n) => s + (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0),
        0,
      );
      return total > 0 && total <= 99 ? String(Math.round(total)) : "";
    }
    case "promoCode":
      return clean(f.promoCode, 40);
    case "promoText":
      return clean(f.promoText, 120);
    case "event":
      return clean(f.event, 60);
    case "dealEndsIn":
      return clean(f.dealEndsIn, 40);
    case "salePrice":
      return exact ? clean(f.salePrice, 20) : "";
    case "originalPrice":
      return exact ? clean(f.originalPrice, 20) : "";
    case "stars":
      return typeof f.stars === "number" && f.stars > 0 ? String(f.stars) : "";
    case "reviews":
      return typeof f.reviews === "number" && f.reviews > 0 ? String(Math.round(f.reviews)) : "";
    default:
      return "";
  }
}

const TOKEN_RE = /\{\{\s*([a-zA-Z:]+)(?:\|[a-z]+)?\s*\}\}/g;

/**
 * Render a template against the facts. A line that holds any token with no data
 * is dropped whole (so "Now {{salePrice}}" vanishes for Amazon). `{{url}}` is
 * kept literal; `{{image}}` and library tokens ({{lib:*}}, {{flag:*}}, {{aiHook}})
 * are not available here, so the lines carrying them are dropped.
 */
export function renderFormula(template: string, facts: AiPostFacts): string {
  const out: string[] = [];
  for (const line of String(template || "").slice(0, MAX_FORMULA_LEN).split(/\r?\n/)) {
    let drop = false;
    const rendered = line.replace(TOKEN_RE, (_m, name: string) => {
      if (name === "url") return URL_TOKEN;
      if (name === "image") return "";
      const v = tokenValue(name, facts);
      if (!v) drop = true;
      return v;
    });
    if (drop) continue;
    // A line that held only an {{image}} token renders blank: keep real blank
    // lines (paragraph breaks) the author typed, drop the ones a token emptied.
    if (!rendered.trim() && line.trim()) continue;
    out.push(rendered.replace(/\s+$/, ""));
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripDashes(text: string): string {
  return text.replace(/\u2014/g, " - ").replace(/\s+-\s+-\s+/g, " - ").replace(/ {2,}/g, " ");
}

function numbersIn(text: string): Set<string> {
  return new Set((text.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))));
}

/**
 * True when the model's rewrite is safe to show: same promo code, url placeholder
 * kept, no number that is not in the skeleton or facts, no dollar price on a
 * percent-only store.
 */
export function rewriteIsFaithful(rewrite: string, skeleton: string, facts: AiPostFacts): boolean {
  if (!rewrite.trim()) return false;
  const code = clean(facts.promoCode, 40);
  if (code && !rewrite.toUpperCase().includes(code.toUpperCase())) return false;
  const urls = (skeleton.match(/\{\{url\}\}/g) ?? []).length;
  if (urls > 0 && (rewrite.match(/\{\{url\}\}/g) ?? []).length < 1) return false;
  if (!allowsExactPrice(facts.store) && /[$€£]\s?\d|\d\s?(?:usd|dollars)\b/i.test(rewrite)) return false;
  const allowed = numbersIn(
    [skeleton, facts.title, facts.promoText, facts.event, facts.dealEndsIn].filter(Boolean).join(" "),
  );
  // The promo code is verified above; its digits (SAVE15) are not claims.
  let scan = rewrite.replace(/\{\{url\}\}/g, "");
  if (code) scan = scan.split(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig")).join(" ");
  for (const n of numbersIn(scan)) {
    // Allow the harmless "1" / "2" / "3" of list-style wording and emoji counts.
    if (!allowed.has(n) && Number(n) > 3) return false;
  }
  return true;
}

const SYSTEM_PROMPT = [
  "You write social media deal posts for an Amazon influencer. You are given a",
  "skeleton post (the creator's own formula, already filled with the real product",
  "facts). Rewrite it as a fresh post that keeps the same structure, line order,",
  "emoji style, length and voice, but varies the wording so it does not read like a",
  "template. Hard rules: use ONLY facts present in the skeleton or facts list; never",
  "invent a price, discount, percentage, count, or claim; never write a dollar price",
  "unless the skeleton already contains it; keep any promo code EXACTLY as given;",
  "keep every {{url}} placeholder exactly as written, do not turn it into a link;",
  "do not add hashtags unless the skeleton has them. Never use em dashes; use a",
  "colon for a label and its description, or a hyphen or comma for a break.",
  'Respond ONLY with a JSON object: {"post": string}.',
].join(" ");

function buildUserPrompt(skeleton: string, input: AiPostInput): string {
  const f = input.facts;
  const lines = ["Skeleton post:", skeleton, "", "Facts you may use:"];
  const add = (label: string, v: string) => v && lines.push(`- ${label}: ${v}`);
  add("Product", clean(f.title, 140));
  add("Brand", clean(f.brand, 60));
  add("Store", clean(f.store, 30));
  add("Percent off", pct(f.percentOff));
  add("Promo", clean(f.promoText, 120));
  add("Promo code", clean(f.promoCode, 40));
  add("Event", clean(f.event, 60));
  if (input.tone) lines.push(`Preferred tone: ${clean(input.tone, 30)}`);
  if (input.locale) lines.push(`Write in this language: ${clean(input.locale, 20)}.`);
  const prev = (input.previous ?? []).map((p) => clean(p, 400)).filter(Boolean).slice(-3);
  if (prev.length) {
    lines.push("", "Earlier versions the creator did not pick. Write something clearly different:");
    prev.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
  } else if ((input.variant ?? 0) > 0) {
    lines.push("", "Give a different take than the most obvious rewrite.");
  }
  return lines.join("\n");
}

async function callModel(
  p: { url: string; key: string; model: string; kind: "groq" | "openai" },
  userPrompt: string,
  temperature: number,
): Promise<{ post: string | null; diag: string | null }> {
  const res = await fetch(p.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: p.model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!res.ok) {
    console.error("[ai-post] chat", p.kind, p.model, res.status);
    return { post: null, diag: `${p.kind}-${res.status}` };
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content;
  if (!content) return { post: null, diag: `${p.kind}-empty` };
  try {
    const o = JSON.parse(content) as { post?: unknown };
    const post = typeof o.post === "string" ? stripDashes(o.post).trim().slice(0, MAX_POST_LEN) : "";
    return post ? { post, diag: null } : { post: null, diag: `${p.kind}-no-post` };
  } catch {
    return { post: null, diag: `${p.kind}-parse-fail` };
  }
}

/** Draft the post. Never throws; always returns usable text when a skeleton exists. */
export async function generateAiPost(input: AiPostInput): Promise<AiPostOutcome | null> {
  const facts = input.facts ?? {};
  const skeleton = (
    typeof input.skeleton === "string" && input.skeleton.trim()
      ? stripDashes(input.skeleton.trim().slice(0, MAX_POST_LEN))
      : input.formula?.post
        ? stripDashes(renderFormula(input.formula.post, facts))
        : ""
  ).trim();
  if (!skeleton) return null;

  const comment = input.formula?.comment
    ? stripDashes(renderFormula(input.formula.comment, facts)) || null
    : null;
  const plain: AiPostOutcome = { post: skeleton, comment, source: "formula", diag: null };

  const provider = resolveTextProvider();
  if (!provider) return { ...plain, diag: "no-provider" };

  const prompt = buildUserPrompt(skeleton, input);
  // Regenerate runs warmer so a second click does not return the first answer.
  const temperature = Math.min(1.0, 0.7 + 0.1 * Math.min(3, Math.max(0, input.variant ?? 0)));
  const model = process.env.AI_POST_MODEL?.trim() || provider.model;
  const fallback = provider.kind === "groq" ? openAiFallbackProvider() : null;

  const attempt = async (p: typeof provider, mdl: string) => {
    const r = await callModel({ ...p, model: mdl }, prompt, temperature);
    if (r.post && rewriteIsFaithful(r.post, skeleton, facts)) return { ...r, ok: true as const };
    return { post: null, diag: r.diag ?? "unfaithful", ok: false as const };
  };

  let diag: string | null = null;
  try {
    const first = await attempt(provider, model);
    if (first.ok && first.post) return { post: first.post, comment, source: "ai", diag: null };
    diag = first.diag;
  } catch (err) {
    console.error("[ai-post] threw", err);
    diag = `${provider.kind}-threw`;
  }
  if (fallback) {
    try {
      const second = await attempt(fallback, fallback.model);
      if (second.ok && second.post) return { post: second.post, comment, source: "ai", diag: null };
      diag = second.diag;
    } catch {
      diag = "openai-threw";
    }
  }
  return { ...plain, diag };
}
