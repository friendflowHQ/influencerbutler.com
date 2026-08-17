/**
 * Summary: Shared hero-image generator for blog posts. Wraps the OpenAI
 *   gpt-image-1 call with the house STYLE_SUFFIX so every caller (the admin
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
 * Generate a 1536x1024 branded hero PNG from a scene prompt. Returns base64.
 * Throws with a descriptive message on any failure (caller decides retry).
 */
export async function generateHeroImage(imagePrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt: `${imagePrompt}${STYLE_SUFFIX}`,
      size: "1536x1024",
      quality: "medium",
      n: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenAI image API ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = (await res.json()) as { data?: Array<{ b64_json?: string }> };
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI image API returned no image data");
  return b64;
}
