/**
 * social-caption.ts - the free ("Influencer Butler AI") caption engine behind the
 * extension's "schedule a post" compose box. One-shot JSON call over the same
 * Groq-first / OpenAI-fallback resolver the campaign brief and ai-notes use.
 *
 * Never throws: returns { caption, alts } on success or { caption: null } with a
 * short diag on any miss, so the compose UI can fall back to a hand-typed caption
 * (or the creator's own OpenAI key) instead of erroring.
 */
import { resolveTextProvider, openAiFallbackProvider } from "@/lib/ai-concierge/llm";

export type SocialCaptionInput = {
  // What the creator is posting about, in plain words: a product title, a page
  // title, or a note they typed. Any of these may be empty.
  topic?: string | null;
  productTitle?: string | null;
  imageUrl?: string | null;
  pageUrl?: string | null;
  // "friendly" | "hype" | "informative" | "minimal" - a soft hint, not enforced.
  tone?: string | null;
  // BCP-47-ish locale so the caption is written in the creator's language.
  locale?: string | null;
};

export type SocialCaptionOutcome = {
  caption: string | null;
  alts: string[];
  diag: string | null;
};

export function isSocialCaptionConfigured(): boolean {
  return resolveTextProvider() !== null;
}

const SYSTEM_PROMPT = [
  "You write short, natural social media captions for an Amazon influencer who is",
  "about to schedule a post. Given what the post is about, write one primary",
  "caption plus a couple of alternatives in different angles. Keep them concise,",
  "warm and human: a sentence or two, a tasteful emoji or two is fine, and 2-4",
  "relevant hashtags at the end. Do not invent specific prices, discounts, or",
  "claims you were not given. Never use em dashes; use a colon for a label and its",
  "description, or a hyphen or comma for a break in a sentence.",
  "Respond ONLY with a JSON object of this exact shape:",
  '{"caption": string, "alts": string[]}. caption is your best single caption.',
  "alts is 2-3 alternative captions. Use an empty array if you have no good",
  "alternatives.",
].join(" ");

function buildUserPrompt(input: SocialCaptionInput): string {
  const lines: string[] = [];
  const topic = (input.topic || input.productTitle || "").trim();
  lines.push(`Post is about: ${topic || "the attached image (topic not specified)"}`);
  if (input.productTitle && input.productTitle.trim() && input.productTitle !== topic) {
    lines.push(`Product: ${input.productTitle.trim()}`);
  }
  if (input.pageUrl) lines.push(`Found on page: ${input.pageUrl}`);
  if (input.tone) lines.push(`Preferred tone: ${input.tone}`);
  if (input.locale) lines.push(`Write the captions in this language: ${input.locale}.`);
  return lines.join("\n");
}

const MAX_CAPTION_LEN = 600;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_CAPTION_LEN) : "";
}

function normalize(raw: unknown): { caption: string | null; alts: string[] } {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const caption = cleanText(o.caption) || null;
  const alts = Array.isArray(o.alts)
    ? o.alts.map(cleanText).filter(Boolean).slice(0, 3)
    : [];
  return { caption, alts };
}

/**
 * Draft a caption. Never throws. Mirrors the Groq-first, OpenAI-fallback failover
 * of generateCampaignBrief so a Groq 429 / 400 falls over to OpenAI when a key is
 * set, and a total miss returns caption:null with a diag reason.
 */
export async function generateSocialCaption(
  input: SocialCaptionInput,
): Promise<SocialCaptionOutcome> {
  const provider = resolveTextProvider();
  if (!provider) return { caption: null, alts: [], diag: "no-provider" };
  const model = process.env.SOCIAL_CAPTION_MODEL?.trim() || provider.model;
  const userPrompt = buildUserPrompt(input);

  const call = async (
    url: string,
    key: string,
    mdl: string,
    kind: "groq" | "openai",
  ): Promise<SocialCaptionOutcome> => {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: mdl,
        temperature: 0.7,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[social-caption] chat", kind, mdl, res.status, detail.slice(0, 200));
      if (res.status === 429) return Promise.reject(new Error("rate"));
      return { caption: null, alts: [], diag: `${kind}-${res.status}` };
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return { caption: null, alts: [], diag: `${kind}-empty` };
    try {
      return { ...normalize(JSON.parse(content)), diag: null };
    } catch {
      return { caption: null, alts: [], diag: `${kind}-parse-fail` };
    }
  };

  const fallback = provider.kind === "groq" ? openAiFallbackProvider() : null;
  try {
    const primary = await call(provider.url, provider.key, model, provider.kind);
    if (primary.caption) return primary;
    if (fallback) return await call(fallback.url, fallback.key, fallback.model, fallback.kind);
    return primary;
  } catch (err) {
    if (fallback) {
      try {
        return await call(fallback.url, fallback.key, fallback.model, fallback.kind);
      } catch {
        return { caption: null, alts: [], diag: "openai-threw" };
      }
    }
    console.error("[social-caption] threw", err);
    return { caption: null, alts: [], diag: provider.kind === "groq" ? "groq-threw" : "openai-threw" };
  }
}
