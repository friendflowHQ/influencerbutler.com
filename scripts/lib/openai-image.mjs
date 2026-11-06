/**
 * Summary: Shared OpenAI image call for the local generator scripts, with the
 *   same model fallback list as src/lib/blog-hero.ts (keep the two in sync).
 *   gpt-image-1 was shut down by OpenAI on 2026-10-23, and OpenAI's docs
 *   disagree on the successor id, so we try each model in order and skip any
 *   the API reports as unknown.
 * Dependencies: global fetch (Node 18+).
 */

export const DEFAULT_IMAGE_MODELS = [
  "gpt-image-2.5-sunburst",
  "gpt-image-2.6-sunburst",
  "gpt-image-2",
  "gpt-image-1.5",
];

/** Preferred models first (from --model or OPENAI_IMAGE_MODEL), then the defaults. */
export function imageModelCandidates(preferred) {
  const fromArgs = [preferred, process.env.OPENAI_IMAGE_MODEL]
    .filter(Boolean)
    .flatMap((v) => String(v).split(","))
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([...fromArgs, ...DEFAULT_IMAGE_MODELS])];
}

function isUnknownModelError(status, text) {
  if (status === 404) return true;
  if (status !== 400) return false;
  return /does not exist|model_not_found|"param":\s*"model"|invalid model|not supported/i.test(text);
}

/**
 * Generate one image. Returns { b64, model } for the model that worked.
 * Throws on any non-model error, or when every candidate is unknown.
 */
export async function generateImage({ apiKey, prompt, size = "1536x1024", quality = "medium", preferredModel }) {
  const tried = [];
  for (const model of imageModelCandidates(preferredModel)) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (isUnknownModelError(res.status, text)) {
        tried.push(`${model} (${res.status})`);
        continue;
      }
      throw new Error(`OpenAI API ${res.status} (${model}): ${text.slice(0, 500)}`);
    }
    const json = await res.json();
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error(`OpenAI returned no image data (${model})`);
    return { b64, model };
  }
  throw new Error(`No OpenAI image model available. Tried: ${tried.join(", ")}`);
}
