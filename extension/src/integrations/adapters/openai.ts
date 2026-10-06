import type { IntegrationAdapter, TestResult } from "../types";

// OpenAI. Test is a read-only GET /v1/models; live use is chat completions.
// The key is sent only to api.openai.com over HTTPS.

const BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

// Curated picks so users never have to know model names. The recommended one
// must stay in sync with DEFAULT_MODEL (cheap and solid for short copy tasks).
const MODEL_OPTIONS = [
  { value: DEFAULT_MODEL, recommended: true },
  { value: "gpt-4o" },
  { value: "gpt-4.1-mini" },
  { value: "gpt-4.1" },
  { value: "gpt-5-mini" },
  { value: "gpt-5" },
];

// Plain-language messages for the failures a creator can actually fix. These
// surface verbatim in the extension (caption/voiceover output, Butler's Brief,
// scheduling), so they say what to do next rather than just echoing a status.
export const OPENAI_KEY_INVALID_MESSAGE =
  "OpenAI rejected your API key (it may be invalid or revoked). Create a new key at platform.openai.com/api-keys and paste it in Settings.";
export const OPENAI_OUT_OF_CREDIT_MESSAGE =
  "Your OpenAI account is out of credit. Add billing at platform.openai.com/settings/organization/billing. A ChatGPT Plus subscription does not count: the API is billed separately.";
export const OPENAI_RATE_LIMIT_MESSAGE =
  "OpenAI is rate limiting this key right now. Wait a minute and try again. If it keeps happening, check your billing at platform.openai.com/settings/organization/billing.";

// Pull the machine-readable code/type out of an OpenAI error body, e.g.
// {"error":{"message":"...","type":"insufficient_quota","code":"insufficient_quota"}}.
// Tolerates a missing, non-JSON, or unexpected body.
async function readErrorCode(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: { code?: unknown; type?: unknown } };
    const code = typeof data?.error?.code === "string" ? data.error.code : "";
    const type = typeof data?.error?.type === "string" ? data.error.type : "";
    return `${code} ${type}`.trim().toLowerCase();
  } catch {
    return "";
  }
}

// Map a failed OpenAI response to a message a creator can act on. `codes` is
// the lowercased "code type" string from the error body (may be empty).
export function describeOpenAiFailure(status: number, codes: string): string {
  if (status === 401 || codes.includes("invalid_api_key")) return OPENAI_KEY_INVALID_MESSAGE;
  if (codes.includes("insufficient_quota") || codes.includes("billing")) {
    return OPENAI_OUT_OF_CREDIT_MESSAGE;
  }
  if (status === 429) {
    // A genuine burst limit names itself; a bare 429 on a fresh key is almost
    // always the account having no credit.
    return codes.includes("rate_limit") ? OPENAI_RATE_LIMIT_MESSAGE : OPENAI_OUT_OF_CREDIT_MESSAGE;
  }
  return `OpenAI returned ${status}. Try again shortly.`;
}

async function test(creds: Record<string, string>): Promise<TestResult> {
  const apiKey = (creds.apiKey ?? "").trim();
  if (!apiKey) return { ok: false, message: "Paste your OpenAI API key first." };
  try {
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true, message: "Connected to OpenAI." };
    return { ok: false, message: describeOpenAiFailure(res.status, await readErrorCode(res)) };
  } catch {
    return { ok: false, message: "Could not reach OpenAI. Are you online?" };
  }
}

async function complete(prompt: string, creds: Record<string, string>): Promise<string> {
  const apiKey = (creds.apiKey ?? "").trim();
  if (!apiKey) throw new Error("OpenAI is not connected.");
  const model = (creds.model ?? "").trim() || DEFAULT_MODEL;
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    }),
  });
  if (!res.ok) throw new Error(describeOpenAiFailure(res.status, await readErrorCode(res)));
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned no content.");
  return text;
}

export const openaiAdapter: IntegrationAdapter = {
  id: "openai",
  labelKey: "provOpenai",
  category: "ai",
  hosts: ["https://api.openai.com/*"],
  fields: [
    { name: "apiKey", labelKey: "fieldApiKey", type: "password", placeholder: "sk-..." },
    { name: "model", labelKey: "fieldModel", type: "select", options: MODEL_OPTIONS, optional: true },
  ],
  test,
  complete,
};
