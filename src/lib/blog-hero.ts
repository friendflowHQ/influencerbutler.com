/**
 * Summary: Shared hero-image generator for blog posts. Wraps the OpenAI
 *   image call (model list in imageModelCandidates) with the house STYLE_SUFFIX so every caller (the admin
 *   "Generate with AI" route and the autopilot cron) produces heroes in the
 *   same brand style as scripts/generate-blog-images.mjs. Keep STYLE_SUFFIX
 *   in sync with that script.
 * Dependencies: global fetch; OPENAI_API_KEY.
 */

// Keep a consistent on-brand look across every hero image. Copied verbatim
// from scripts/generate-blog-images.mjs; keep the two in sync.
export const STYLE_SUFFIX =
  " Editorial flat vector illustration, clean and modern, soft rounded shapes, " +
  "warm and friendly, generous negative space, cohesive palette of warm orange " +
  "(#f59e0b) with deep navy and soft cream, subtle texture, no text, no words, " +
  "no letters, no logos, no watermark, 16:9 landscape composition.";

/**
 * Image models to try, in order. gpt-image-1 was shut down by OpenAI on
 * 2026-10-23 ("The model 'gpt-image-1' does not exist"), and OpenAI's docs
 * disagree on the exact successor ID, so we walk a list and move on whenever
 * the API says a model is unknown. OPENAI_IMAGE_MODEL (comma-separated) puts
 * your preferred model(s) first.
 */
const DEFAULT_IMAGE_MODELS = [
  "gpt-image-2.5-sunburst",
  "gpt-image-2.6-sunburst",
  "gpt-image-2",
  "gpt-image-1.5",
];

export function imageModelCandidates(): string[] {
  const fromEnv = (process.env.OPENAI_IMAGE_MODEL || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return [...new Set([...fromEnv, ...DEFAULT_IMAGE_MODELS])];
}

/** True when OpenAI rejected the request because the model id is unknown/retired. */
function isUnknownModelError(status: number, text: string): boolean {
  if (status === 404) return true;
  if (status !== 400) return false;
  return /does not exist|model_not_found|"param":\s*"model"|invalid model|not supported/i.test(text);
}

/**
 * Generate a 1536x1024 branded hero PNG from a scene prompt. Returns base64.
 * Throws with a descriptive message on any failure (caller decides retry).
 */
export async function generateHeroImage(imagePrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const tried: string[] = [];
  for (const model of imageModelCandidates()) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt: `${imagePrompt}${STYLE_SUFFIX}`,
        size: "1536x1024",
        quality: "medium",
        n: 1,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (isUnknownModelError(res.status, text)) {
        tried.push(`${model} (${res.status})`);
        continue;
      }
      throw new Error(`OpenAI image API ${res.status} (${model}): ${text.slice(0, 300)}`);
    }

    const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
    const b64 = json?.data?.[0]?.b64_json;
    if (!b64) throw new Error(`OpenAI image API returned no image data (${model})`);
    return b64;
  }
  throw new Error(`No OpenAI image model available. Tried: ${tried.join(", ")}`);
}
