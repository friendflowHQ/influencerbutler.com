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

async function test(creds: Record<string, string>): Promise<TestResult> {
  const apiKey = (creds.apiKey ?? "").trim();
  if (!apiKey) return { ok: false, message: "Paste your OpenAI API key first." };
  try {
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) return { ok: true, message: "Connected to OpenAI." };
    if (res.status === 401) {
      return { ok: false, message: "OpenAI rejected that key. Check it in your OpenAI dashboard." };
    }
    if (res.status === 429) {
      return { ok: false, message: "Key looks valid but OpenAI is rate limiting. Check billing/quota." };
    }
    return { ok: false, message: `OpenAI returned ${res.status}. Try again shortly.` };
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
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
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
