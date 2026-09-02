/**
 * Extract actionable support items (bugs the customer hit, or explicit feature
 * requests) from a recorded-call transcript, so they can be auto-filed into the
 * support queue. Runs a cheap LLM call, separate from the review-notes summarizer
 * (ai-notes.ts), so the two concerns stay independent and each is testable alone.
 *
 * Provider is auto-selected from env, same OpenAI-compatible chat API as ai-notes:
 *   - GROQ_API_KEY   -> Groq (default model openai/gpt-oss-120b)
 *   - OPENAI_API_KEY -> OpenAI (gpt-4o-mini) fallback
 * Override the model with CALL_TICKETS_MODEL. Returns [] on any failure or when
 * nothing qualifies (the caller then files nothing). No em dashes in output.
 */

export type CallTicketItem = {
  type: "bug" | "feature";
  title: string;
  description: string;
};

type Provider = { url: string; key: string; model: string };

function resolveProvider(): Provider | null {
  const override = process.env.CALL_TICKETS_MODEL?.trim();
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      // llama-3.3-70b was decommissioned 2026-08-16; use the current Groq model
      // the ai-concierge text path migrated to.
      model: override || "openai/gpt-oss-120b",
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      url: "https://api.openai.com/v1/chat/completions",
      key: process.env.OPENAI_API_KEY,
      model: override || "gpt-4o-mini",
    };
  }
  return null;
}

export function isCallTicketsConfigured(): boolean {
  return resolveProvider() !== null;
}

const MAX_TRANSCRIPT_CHARS = 100_000;
// Cap how many tickets one call can spawn, so a rambling call cannot flood the
// support queue. The prompt is also told to dedupe and stay concise.
const MAX_ITEMS = 6;

const SYSTEM_PROMPT =
  "You read a transcript of a recorded 1:1 call between Influencer Butler (an " +
  "Amazon-influencer automation app) and a customer, and pull out ONLY items worth " +
  "opening a support ticket for. Two kinds qualify: (1) a concrete bug or problem the " +
  "customer actually hit with the product, and (2) an explicit feature request the " +
  "customer asked for. Do NOT include general questions that were answered on the call, " +
  "praise, small talk, billing chit-chat, or the host's own follow-up tasks. If nothing " +
  "qualifies, return an empty list. Merge duplicates. Do not invent anything not in the " +
  'transcript. Respond ONLY with a JSON object of shape {"items": Array<{"type": "bug" | ' +
  '"feature", "title": string, "description": string}>}. title: a short specific summary ' +
  "(max ~120 chars). description: 1-3 sentences of detail from the call, enough for support " +
  "to act on. Do not use em-dashes.";

/**
 * Pull support-ticket-worthy items out of a transcript. `summary` (the AI notes
 * summary, when available) is passed as light extra context. Returns [] on any
 * failure or when nothing qualifies.
 */
export async function extractSupportItems(
  transcript: string,
  ctx: { callType: string; topic?: string | null; summary?: string | null },
): Promise<CallTicketItem[]> {
  const provider = resolveProvider();
  if (!provider) { console.warn("[call-tickets] no GROQ_API_KEY / OPENAI_API_KEY configured"); return []; }
  const text = (transcript || "").slice(0, MAX_TRANSCRIPT_CHARS).trim();
  if (!text) return [];

  const userPrompt =
    `Call type: ${ctx.callType}` +
    (ctx.topic ? `\nStated topic: ${ctx.topic}` : "") +
    (ctx.summary ? `\nCall summary: ${ctx.summary}` : "") +
    `\n\nTranscript:\n${text}`;

  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) { console.error("[call-tickets] chat", res.status, await res.text().catch(() => "")); return []; }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return [];
    return normalizeItems(JSON.parse(content));
  } catch (err) {
    console.error("[call-tickets] threw", err);
    return [];
  }
}

/** Coerce arbitrary LLM JSON into a clean, capped CallTicketItem[]. Exported for tests. */
export function normalizeItems(raw: unknown): CallTicketItem[] {
  const root = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  // Accept either { items: [...] } or a bare array, defensively.
  const list = Array.isArray(root.items) ? root.items : Array.isArray(raw) ? (raw as unknown[]) : [];
  const out: CallTicketItem[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const o = entry as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim().slice(0, 200) : "";
    if (!title) continue;
    const type = o.type === "feature" ? "feature" : "bug";
    const description = typeof o.description === "string" ? o.description.trim().slice(0, 4000) : "";
    out.push({ type, title, description });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}
