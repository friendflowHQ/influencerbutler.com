import type { ProductSignals } from "../../amazon/product-signals";
import type {
  VoiceoverAboutMe,
  VoiceoverDisclosureKey,
  VoiceoverHookStyle,
  VoiceoverPacing,
  VoiceoverSettings,
  VoiceoverVideoType,
} from "../../storage/schema";

// Builds the single OpenAI prompt behind the "Draft voiceover (AI)" button in
// the My Link panel. The directives are ported from the desktop app's
// Voiceover Butler (workspaces/voiceover-butler/lib/scriptGenerator.js) so a
// creator gets the same script styles in both places; the desktop's product
// dossier is replaced by the page signals the extension already reads. Pure
// module: no chrome APIs, unit-tested in voiceover-prompt.test.ts.

export const LENGTH_MIN_SECONDS = 5;
export const LENGTH_MAX_SECONDS = 120;
const LENGTH_DEFAULT_SECONDS = 30;

export const VIDEO_TYPE_LABELS: Record<VoiceoverVideoType, string> = {
  "social-hook": "Social Media Hook & Script",
  tutorial: "Tutorial Script",
  unboxing: "Unboxing Script",
  "problem-solution": "Problem / Solution Script",
  "edu-story": "Educational & Storytelling Script",
  "product-setup": "Product Setup / Introduction Script",
};

export const VIDEO_TYPE_DIRECTIVES: Record<VoiceoverVideoType, string> = {
  "social-hook":
    "Open with an engaging hook, then deliver a brief, impactful script that " +
    "highlights the product's three key features and concludes with a " +
    "compelling reason the viewer needs it in their life. Keep it concise " +
    "and attention-grabbing.",
  tutorial:
    "Craft a step-by-step, relatable, educational script demonstrating the " +
    "product's usage. Touch on a pain point, then walk through how the " +
    "product solves it. Highlight practical benefits like ease of cleaning, " +
    "portability, or speed. Make it clear and easy to follow.",
  unboxing:
    "Narrate the script as if opening the package for the first time. Note " +
    "the texture, weight, and any small surprise details a viewer would " +
    "notice. Stay grounded in observation: no claims about results you have " +
    "not actually seen yet.",
  "problem-solution":
    "Open by naming the problem the viewer almost certainly has, then reveal " +
    "the product as the fix. Walk briefly through how it solves the pain " +
    "point, naming one or two specific moments where it helps.",
  "edu-story":
    "Tell a short, true-feeling story that teaches one specific thing the " +
    "viewer can use today. Weave the product in naturally as the tool that " +
    "made the lesson possible, not as the focus of the story.",
  "product-setup":
    "Introduce the product and walk the viewer through getting it ready to " +
    "use for the first time. Cover what comes in the box, any assembly or " +
    "first-time setup steps, and the moment it is ready to go. Keep the tone " +
    "welcoming and reassuring so a new owner feels confident.",
};

// "custom" is handled separately in buildScriptDirective (the creator's own
// opening line is used verbatim), so it has no entry here.
export const HOOK_STYLE_DIRECTIVES: Record<Exclude<VoiceoverHookStyle, "custom">, string> = {
  "joke-pun": "Open with a joke or pun relevant to the product or the problem it solves.",
  relatable:
    "Open with a relatable scenario the audience will recognise from their own life.",
  "30-day-review":
    'Open with: "I\'ve been using this for the last 30 days and here\'s what ' +
    'I think." Adapt the wording naturally; do not quote it verbatim.',
  "tired-of":
    'Open with: "If you\'re tired of [problem], try this." Replace [problem] ' +
    "with the specific pain point the product solves.",
  "bold-claim":
    "Open with a bold, specific claim or statistic about the result the " +
    "product delivers: no exaggeration, no medical claims.",
  question: "Open with a direct question to the viewer.",
  "surprise-reveal":
    "Open with a surprise reveal that subverts the viewer's expectation in " +
    "the first second.",
};

export const PACING_DIRECTIVES: Record<VoiceoverPacing, string> = {
  slow: "Pacing: slow and contemplative: longer sentences, room to breathe.",
  standard: "Pacing: standard, a natural conversational rhythm.",
  fast: "Pacing: fast and punchy: short sentences, high energy.",
};

export const DISCLOSURE_DIRECTIVES: Record<VoiceoverDisclosureKey, string> = {
  "honest-paid-sample":
    'Include this FTC disclosure naturally somewhere in the script: "I ' +
    'received this product as a free sample, but my opinions are my own."',
  "affiliate-link":
    'Include this FTC disclosure naturally somewhere in the script: "This ' +
    "contains affiliate links; if you buy through them I may earn a small " +
    'commission."',
  "free-pr-sample":
    'Include this FTC disclosure naturally somewhere in the script: "This ' +
    'was sent to me as a PR sample at no cost."',
  none: "Do not include any FTC disclosure phrase in this script.",
};

export function clampLength(raw: number): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return LENGTH_DEFAULT_SECONDS;
  if (n < LENGTH_MIN_SECONDS) return LENGTH_MIN_SECONDS;
  if (n > LENGTH_MAX_SECONDS) return LENGTH_MAX_SECONDS;
  return n;
}

export type ApparelType = "top" | "dress" | "bottom" | "shoes" | "beauty" | "other";

// Order matters: more specific buckets (shoes, dress) are tested before the
// broader top/bottom buckets so e.g. a "dress shoe" lands in shoes. Ported
// from the desktop apparelProfile.js; the desktop matches browse-node leaves,
// the extension matches the page title + breadcrumb category, so bare words
// like "top" can false-positive on non-apparel titles. That only adds a
// harmless fit section, the same tradeoff the desktop accepted.
const APPAREL_BUCKETS: Array<{ type: ApparelType; keywords: string[] }> = [
  { type: "shoes", keywords: ["shoe", "footwear", "sneaker", "boot", "sandal", "heel", "loafer", "slipper", "flip flop", "flip-flop"] },
  { type: "dress", keywords: ["dress", "gown"] },
  { type: "top", keywords: ["shirt", "blouse", "tee", "t-shirt", "tank", "top", "sweater", "hoodie", "sweatshirt", "jacket", "coat", "blazer", "cardigan", "outerwear", "pullover"] },
  { type: "bottom", keywords: ["pant", "jean", "trouser", "short", "skirt", "legging", "jogger", "chino", "sweatpant", "bottom"] },
  { type: "beauty", keywords: ["beauty", "makeup", "cosmetic", "skincare", "skin care", "fragrance", "perfume", "lipstick", "foundation", "mascara", "nail"] },
];

// Which About Me fields are relevant per detected garment/category type.
const FIELDS_BY_TYPE: Record<Exclude<ApparelType, "other">, Array<keyof VoiceoverAboutMe>> = {
  top: ["height", "topSize", "bustSize", "preferredColors", "preferredStyles"],
  dress: ["height", "dressSize", "bustSize", "preferredColors", "preferredStyles"],
  bottom: ["height", "pantSize", "preferredColors", "preferredStyles"],
  shoes: ["shoeSize", "preferredStyles"],
  beauty: ["hairColor", "eyeColor", "skinTone", "preferredColors", "preferredStyles"],
};

const ABOUT_ME_LABELS: Record<keyof VoiceoverAboutMe, string> = {
  height: "Height",
  topSize: "Top size",
  bustSize: "Bust size",
  dressSize: "Dress size",
  pantSize: "Pant size",
  shoeSize: "Shoe size",
  hairColor: "Hair color",
  eyeColor: "Eye color",
  skinTone: "Skin tone / undertone",
  preferredColors: "Preferred colors",
  preferredStyles: "Preferred styles",
};

export function classifyApparel(title: string | null, category: string | null): ApparelType {
  const haystack = [title ?? "", category ?? ""].join(" | ").toLowerCase();
  if (!haystack.trim()) return "other";
  for (const { type, keywords } of APPAREL_BUCKETS) {
    if (keywords.some((kw) => haystack.includes(kw))) return type;
  }
  return "other";
}

function trimmed(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

// Stored settings are typed, but the store can hold values written by an older
// or newer schema: fall back to the default for any enum value we don't know,
// mirroring the desktop's normalizeScriptOptions.
function normalizeDefaults(vo: VoiceoverSettings): VoiceoverSettings["defaults"] {
  const d = vo.defaults ?? ({} as VoiceoverSettings["defaults"]);
  return {
    lengthSeconds: clampLength(d.lengthSeconds),
    videoType: VIDEO_TYPE_DIRECTIVES[d.videoType] ? d.videoType : "social-hook",
    hookStyle:
      d.hookStyle === "custom" || HOOK_STYLE_DIRECTIVES[d.hookStyle as Exclude<VoiceoverHookStyle, "custom">]
        ? d.hookStyle
        : "relatable",
    hookCustom: trimmed(d.hookCustom),
    pacing: PACING_DIRECTIVES[d.pacing] ? d.pacing : "standard",
    disclosureKey: DISCLOSURE_DIRECTIVES[d.disclosureKey] ? d.disclosureKey : "honest-paid-sample",
  };
}

function aboutMeLines(aboutMe: VoiceoverAboutMe, type: ApparelType): string[] {
  if (type === "other") return [];
  const lines: string[] = [];
  for (const field of FIELDS_BY_TYPE[type]) {
    const value = trimmed(aboutMe?.[field]);
    if (value) lines.push(`- ${ABOUT_ME_LABELS[field]}: ${value}`);
  }
  return lines;
}

export function buildVoiceoverPrompt(signals: ProductSignals, vo: VoiceoverSettings): string {
  const defaults = normalizeDefaults(vo);
  const denylist = (vo.brandDenylist ?? []).map((b) => b.trim()).filter((b) => b.length >= 2);
  const lines: string[] = [];

  lines.push(
    "You are Voiceover Butler, writing the spoken script for a short-form " +
      "product video an Amazon affiliate creator will record. Follow every " +
      "rule exactly.",
    "",
    "## Rules",
    "- Respond with ONLY the spoken script as plain text. No title, no " +
      "headings, no quotation marks around the whole script, no emojis, no " +
      "stage directions, no timestamps, no preamble or trailing commentary.",
    "- Never mention the price, the brand name, or the exact product name. " +
      'Refer to the product generically (for example "this blender").',
    '- No medical claims, no unverifiable claims, no "click the link" phrasing.',
  );
  if (denylist.length) {
    lines.push(`- Never mention any of these brands under any circumstances: ${denylist.join(", ")}.`);
  }

  lines.push("", "## Product (from the Amazon listing; context only, do not quote verbatim)");
  lines.push(`- Product title: ${trimmed(signals.title ?? undefined) || signals.asin || "unknown"}`);
  if (signals.category) lines.push(`- Category: ${signals.category}`);
  if (signals.brand) lines.push(`- Brand (do NOT say this in the script): ${signals.brand}`);

  const tone = trimmed(vo.tone);
  const niche = trimmed(vo.niche);
  const audience = trimmed(vo.audience);
  if (tone || niche || audience) {
    lines.push("", "## Creator profile");
    if (tone) lines.push(`- Tone: ${tone}`);
    if (niche) lines.push(`- Niche: ${niche}`);
    if (audience) lines.push(`- Target audience: ${audience}`);
  }

  const apparelType = classifyApparel(signals.title, signals.category);
  const fitLines = aboutMeLines(vo.aboutMe, apparelType);
  if (fitLines.length) {
    lines.push(
      "",
      "## Creator fit & styling",
      "This is an apparel/beauty item. Where it reads naturally, ground the " +
        "script in the creator's own fit below so viewers can gauge sizing " +
        "for themselves. Sizes, measurements, and color/style preferences " +
        "are allowed; never state any brand or product name.",
      ...fitLines,
    );
  }

  lines.push("", "## Script directive");
  lines.push(`- Type: ${VIDEO_TYPE_LABELS[defaults.videoType]}`);
  lines.push(`  - ${VIDEO_TYPE_DIRECTIVES[defaults.videoType]}`);
  lines.push(
    `- Target length: approximately ${defaults.lengthSeconds} seconds spoken ` +
      `(~${Math.round(defaults.lengthSeconds * 2.5)} words).`,
  );
  if (defaults.hookStyle === "custom") {
    if (defaults.hookCustom) {
      lines.push(
        `- Opening hook (custom: open with this exact line, lightly polished): "${defaults.hookCustom}"`,
      );
    } else {
      lines.push(`- Opening hook: ${HOOK_STYLE_DIRECTIVES.relatable}`);
    }
  } else {
    lines.push(`- Opening hook: ${HOOK_STYLE_DIRECTIVES[defaults.hookStyle]}`);
  }
  lines.push(`- ${PACING_DIRECTIVES[defaults.pacing]}`);
  lines.push(`- ${DISCLOSURE_DIRECTIVES[defaults.disclosureKey]}`);

  lines.push(
    "",
    "## Task",
    "Produce exactly one script that satisfies the directive and every rule " +
      "above. Plain text only.",
  );

  return lines.join("\n");
}

// Post-generation check: the first denylisted brand the script still mentions,
// or null. The desktop collects a denylist but never applies it; here the
// draft is scanned so the panel can warn the creator before they use it.
export function findDeniedBrand(script: string, denylist: string[]): string | null {
  const haystack = script.toLowerCase();
  for (const raw of denylist ?? []) {
    const brand = raw.trim();
    if (brand.length < 2) continue;
    if (haystack.includes(brand.toLowerCase())) return brand;
  }
  return null;
}
