/**
 * Turn a call transcript into structured review notes with a cheap LLM.
 *
 * Provider is auto-selected from env (both use the OpenAI-compatible chat API):
 *   - GROQ_API_KEY  → Groq llama-3.3-70b-versatile (default; cheapest, pennies/call)
 *   - OPENAI_API_KEY → OpenAI gpt-4o-mini (fallback)
 * Override the model with AI_NOTES_MODEL. Returns null if no key is configured
 * or the call fails; the caller stores the raw transcript regardless.
 */

export type AiNotes = {
  summary: string;
  keyTopics: string[];
  actionItems: string[];
  followUps: string[];
};

type Provider = { url: string; key: string; model: string };

function resolveProvider(): Provider | null {
  const override = process.env.AI_NOTES_MODEL?.trim();
  if (process.env.GROQ_API_KEY) {
    return {
      url: "https://api.groq.com/openai/v1/chat/completions",
      key: process.env.GROQ_API_KEY,
      model: override || "llama-3.3-70b-versatile",
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

export function isAiNotesConfigured(): boolean {
  return resolveProvider() !== null;
}

// Cap transcript length fed to the model. A 2h call is well under this; the cap
// only guards against a runaway transcript blowing context/cost.
const MAX_TRANSCRIPT_CHARS = 100_000;

const SYSTEM_PROMPT =
  "You summarize a recorded 1:1 call between Influencer Butler (an Amazon-influencer " +
  "automation app) and a customer. Return concise, factual notes the host can review " +
  "later. Do not invent details not present in the transcript. Respond ONLY with a JSON " +
  'object of shape {"summary": string, "keyTopics": string[], "actionItems": string[], ' +
  '"followUps": string[]}. summary: 3-6 sentences. keyTopics: short phrases. actionItems: ' +
  "things the host committed to do. followUps: open questions or next steps. Use empty " +
  "arrays when a section has nothing. Do not use em-dashes.";

/**
 * Summarize a transcript into structured notes. `callType` and `topic` give the
 * model light context. Returns null on any failure.
 */
export async function summarizeTranscript(
  transcript: string,
  ctx: { callType: string; topic?: string | null },
): Promise<AiNotes | null> {
  const provider = resolveProvider();
  if (!provider) { console.warn("[ai-notes] no GROQ_API_KEY / OPENAI_API_KEY configured"); return null; }
  const text = (transcript || "").slice(0, MAX_TRANSCRIPT_CHARS).trim();
  if (!text) return null;

  const userPrompt =
    `Call type: ${ctx.callType}${ctx.topic ? `\nStated topic: ${ctx.topic}` : ""}\n\n` +
    `Transcript:\n${text}`;

  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
    if (!res.ok) { console.error("[ai-notes] chat", res.status, await res.text().catch(() => "")); return null; }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return null;
    return normalize(JSON.parse(content));
  } catch (err) {
    console.error("[ai-notes] threw", err);
    return null;
  }
}

function normalize(raw: unknown): AiNotes {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 20) : [];
  return {
    summary: typeof o.summary === "string" ? o.summary.trim() : "",
    keyTopics: arr(o.keyTopics),
    actionItems: arr(o.actionItems),
    followUps: arr(o.followUps),
  };
}
