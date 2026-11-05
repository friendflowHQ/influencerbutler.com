/**
 * Summary: Turns a screenshot a customer pasted into the Butler AI chat into a
 *   shared Community look template for Collage Butler or Fashion Looks, with no
 *   owner approval (owner decision 2026-11-05). The image is checked by OpenAI
 *   moderation, then an OpenAI vision model describes ONLY the layout, colors,
 *   type style and (for outfits) the outfit recipe as a look template spec; no
 *   words, brand names, logos or handles are copied and the screenshot itself is
 *   never stored. The spec is published to the licensing worker's
 *   /community-templates (shared secret), which re-normalizes it, dedupes the same
 *   look, and caps each creator per day. Every install picks it up from there.
 * Dependencies: node:crypto, global fetch; env OPENAI_API_KEY, LICENSING_WORKER_SECRET,
 *   BB_LICENSING_WORKER_URL (optional), AI_CONCIERGE_VISION_MODEL (optional),
 *   COMMUNITY_TEMPLATES_ENABLED (optional, "0" turns it off).
 */

import { createHash } from "node:crypto";

export type LookTemplateResult = {
  ok: boolean;
  error?: string;
  message?: string;
  duplicate?: boolean;
  template?: { id: string; butler: "collage" | "fashion"; name: string; category: string };
};

const IMAGE_RE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_IMAGE_CHARS = 2_200_000; // about 1.5 MB of image

export const LOOK_TEMPLATE_TOOL = {
  name: "build_look_template",
  description:
    "Turn the screenshot the user pasted in this chat into a new Community template for Collage Butler (a product collage board) or Fashion Looks (an outfit board, often with a person). It is added for every creator right away, no review needed. Call it when the user pasted a screenshot and asks to make it a template, use it as a template, or copy the look. If it is not clear which butler they mean, ask first: Collage Butler or Fashion Looks.",
  parameters: {
    type: "object",
    properties: {
      butler: { type: "string", enum: ["collage", "fashion"], description: "collage = Collage Butler product board; fashion = Fashion Looks outfit board." },
      notes: { type: "string", description: "Anything the user asked to change or keep (for example 'make it pink', 'six products'). Optional." },
    },
    required: ["butler"],
    additionalProperties: false,
  },
} as const;

/** The newest user turn's pasted screenshot (one image per conversation reaches here). */
export function pickLatestImage(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i] as { role?: unknown; images?: unknown };
    if (!m || m.role !== "user" || !Array.isArray(m.images)) continue;
    const img = m.images[0];
    if (typeof img === "string" && img.length <= MAX_IMAGE_CHARS && IMAGE_RE.test(img)) return img;
  }
  return null;
}

/** System note for the text model: an image exists, and what it may do with it. */
export const IMAGE_NOTE =
  "The user attached a screenshot in this conversation. You cannot see it. If they want it as a template (or to copy that look), call build_look_template " +
  "(ask Collage Butler or Fashion Looks first when unclear). For anything else about the image, say you can turn screenshots into Collage Butler or Fashion Looks templates, and ask what they need.";

const EXTRACT_PROMPT = [
  "You design templates for a social media collage tool. Look at the screenshot and describe its LAYOUT as data so we can rebuild the same look with different products.",
  "Return ONLY a JSON object with these keys:",
  'butler: "BUTLER"',
  'name: { "en-US": short catchy name (max 40 chars), "es-ES": Spanish, "fr-FR": French }. Describe the style (e.g. "Cream editorial board"). Never use a brand, store, product or person name.',
  'category: one of grid, editorial, minimal, bold, seasonal, holiday, outfit, flatlay, moodboard, other',
  'season: one of any, spring, summer, fall, winter, holiday',
  "tags: up to 6 short lowercase style words",
  'canvas: { aspect: one of "4:5", "2:3", "1:1", "9:16" } closest to the screenshot',
  'background: { color: "#RRGGBB", color2: "#RRGGBB" only for a vertical gradient else "", texture: none|paper|linen|grain }',
  'palette: { bg, accent, text, muted } as "#RRGGBB"',
  'frame: { style: none|line|double, color: "#RRGGBB" }',
  "slots: one box per product photo, 1 to 12, as fractions of the canvas (x, y, w, h between 0 and 1, top-left origin, no overlap with the text), each with " +
    "shape (rect|rounded|circle|arch), fit (contain|cover), cutout (true when products float with no background), shadow (bool), card (true when the product sits on a white card), " +
    "label (none|price|name|number), rotate (degrees, -20 to 20)",
  "texts: up to 6 text blocks, each { role: store|title|subtitle|cta|signature|disclosure, x, y, w, font: serif|classic|caslon|sans|geometric|rounded|script|hand|display, " +
    "size (letter height as a fraction of canvas width, 0.012 to 0.16), color, align: left|center|right, case: none|upper|lower|title, italic, weight 300-800, letterSpacing in em }. " +
    "Describe only where text sits and how it looks. Never copy the words.",
  "decor: up to 8 small decorations { kind: sparkle|heart|star|dot|leaf|snowflake|blossom|sprig|sun|wave, x, y, size, color, rotate }",
  "FASHION_EXTRA",
  "Do not include logos, watermarks, usernames or any words from the image.",
].join("\n");

const FASHION_EXTRA =
  'modelFigure: { side: "left"|"right"|"none" } where the person stands (none if no person). ' +
  'style: { promptSeed: one sentence describing the outfit style to recreate (garments, colors, fabrics, vibe; no brands, max 300 chars), keywords: up to 10 shopping search phrases for the pieces (e.g. "cream cable knit sweater women") }. ' +
  "Leave the person's area free of product slots.";

function workerUrl(): string {
  return (process.env.BB_LICENSING_WORKER_URL || "https://licensing.influencerbutler.com").replace(/\/+$/, "");
}

function creatorRef(userId: string): string {
  return `u:${createHash("sha256").update(`ib-community-templates:${userId}`).digest("hex").slice(0, 40)}`;
}

async function moderate(image: string, key: string, fetchImpl: typeof fetch): Promise<boolean> {
  try {
    const res = await fetchImpl("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "omni-moderation-latest", input: [{ type: "image_url", image_url: { url: image } }] }),
    });
    if (!res.ok) return false; // cannot check -> do not publish
    const json = (await res.json()) as { results?: Array<{ flagged?: boolean }> };
    return !!json.results && json.results.length > 0 && !json.results.some((r) => r.flagged);
  } catch {
    return false;
  }
}

async function extractSpec(image: string, butler: "collage" | "fashion", notes: string, key: string, fetchImpl: typeof fetch): Promise<Record<string, unknown> | null> {
  const prompt = EXTRACT_PROMPT.replace("BUTLER", butler).replace("FASHION_EXTRA", butler === "fashion" ? FASHION_EXTRA : "");
  const res = await fetchImpl("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.AI_CONCIERGE_VISION_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            { type: "text", text: notes ? `The creator's notes (apply them): ${notes.slice(0, 300)}` : "Describe this layout." },
            { type: "image_url", image_url: { url: image, detail: "high" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  try {
    const spec = JSON.parse(json.choices?.[0]?.message?.content || "null");
    if (!spec || typeof spec !== "object") return null;
    (spec as Record<string, unknown>).butler = butler;
    return spec as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Build and publish one Community template from the pasted screenshot.
 * Returns a small result the model can explain (never the spec or the image).
 */
export async function buildLookTemplate(
  opts: { butler: unknown; notes?: unknown; image: string | null; userId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<LookTemplateResult> {
  if (String(process.env.COMMUNITY_TEMPLATES_ENABLED ?? "1") === "0") {
    return { ok: false, error: "disabled", message: "Template building is paused right now. Tell the user to try again later." };
  }
  const butler = opts.butler === "fashion" ? "fashion" : opts.butler === "collage" ? "collage" : null;
  if (!butler) return { ok: false, error: "bad_butler", message: "Ask whether this is for Collage Butler or Fashion Looks." };
  if (!opts.image) return { ok: false, error: "no_image", message: "No screenshot is attached. Ask the user to paste the screenshot (the paperclip button or Ctrl+V) and send it again." };
  const key = process.env.OPENAI_API_KEY;
  const secret = process.env.LICENSING_WORKER_SECRET;
  if (!key || !secret) return { ok: false, error: "not_configured", message: "Template building is not available yet. Apologize and suggest trying again later." };

  if (!(await moderate(opts.image, key, fetchImpl))) {
    return { ok: false, error: "rejected", message: "That screenshot cannot be turned into a template. Ask for a different one of a product collage or outfit board." };
  }
  const notes = typeof opts.notes === "string" ? opts.notes : "";
  let spec: Record<string, unknown> | null = null;
  try { spec = await extractSpec(opts.image, butler, notes, key, fetchImpl); } catch { spec = null; }
  if (!spec) return { ok: false, error: "unreadable", message: "The layout could not be read from that screenshot. Ask for a clearer, uncropped screenshot." };

  let res: Response;
  try {
    res = await fetchImpl(`${workerUrl()}/community-templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ib-worker-secret": secret },
      body: JSON.stringify({ spec, creatorRef: creatorRef(opts.userId) }),
    });
  } catch {
    return { ok: false, error: "unavailable", message: "Saving the template failed. Ask the user to try again in a minute." };
  }
  const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; duplicate?: boolean; template?: Record<string, unknown> } | null;
  if (res.status === 429 || json?.error === "daily_limit") {
    return { ok: false, error: "daily_limit", message: "The user reached today's limit of new templates (5 a day). They can add more tomorrow." };
  }
  if (!json?.ok || !json.template) {
    return { ok: false, error: json?.error || `http_${res.status}`, message: "That screenshot could not be turned into a template. Ask for a screenshot that shows the whole board." };
  }
  const t = json.template as { id?: string; name?: Record<string, string>; category?: string };
  return {
    ok: true,
    duplicate: !!json.duplicate,
    template: { id: String(t.id || ""), butler, name: (t.name && t.name["en-US"]) || "", category: String(t.category || "") },
    message: json.duplicate
      ? "This look was already in the Community templates. Tell the user it is ready to use."
      : butler === "collage"
        ? "Added. Tell the user it is in Collage Butler > Collage Templates under Community, and that every creator can use it now."
        : "Added. Tell the user it is in Fashion Looks under Template > Community, and that every creator can use it now.",
  };
}
