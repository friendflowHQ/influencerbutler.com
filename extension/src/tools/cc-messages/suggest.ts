// Suggest which saved template fits a brand's latest message, so the Templates
// picker can highlight it. Suggestion only: nothing is ever inserted or sent from
// here. Pure and DOM-free so it is unit-tested.

export type Intent = "address" | "sample" | "link" | "thanks";

// Checked in order, so a message asking for a shipping address is "address"
// even though it also mentions a sample.
const INTENT_PATTERNS: Array<[Intent, RegExp]> = [
  ["address", /\b(shipping address|mailing address|your address|where (?:should|can) we (?:ship|send)|ship (?:it )?to)\b/i],
  ["link", /\b(link to (?:your|the) (?:post|video|content)|send (?:us|me) (?:the|your) link|post link|content link|share (?:the|your) link|submit (?:the|your) link)\b/i],
  ["sample", /\b(free sample|samples?|send you (?:a|some|the) |happy to send|product to try)\b/i],
  ["thanks", /\b(thank you|thanks|appreciate)\b/i],
];

export function detectIntent(brandMessage: string): Intent | null {
  const text = brandMessage.trim();
  if (!text) return null;
  for (const [intent, pattern] of INTENT_PATTERNS) {
    if (pattern.test(text)) return intent;
  }
  return null;
}

// Words that mark a template as the right reply for each intent.
const INTENT_WORDS: Record<Intent, string[]> = {
  address: ["address", "shipping", "ship"],
  sample: ["sample", "product", "request"],
  link: ["link", "post", "content", "submit"],
  thanks: ["thank", "thanks", "appreciate"],
};

export type TemplateLike = { id: string; label: string; body: string };

// The template that best answers `intent`, or null. A match in the LABEL is what
// counts (creators name their templates for what they do); body-only matches are
// too weak to point at one template.
export function suggestTemplateId(templates: TemplateLike[], intent: Intent | null): string | null {
  if (!intent) return null;
  const words = INTENT_WORDS[intent];
  let bestId: string | null = null;
  let bestScore = 0;
  for (const template of templates) {
    const label = template.label.toLowerCase();
    const body = template.body.toLowerCase();
    let score = 0;
    for (const word of words) {
      if (label.includes(word)) score += 3;
      else if (body.includes(word)) score += 1;
    }
    // Require at least one label hit.
    if (score >= 3 && score > bestScore) {
      bestScore = score;
      bestId = template.id;
    }
  }
  return bestId;
}
