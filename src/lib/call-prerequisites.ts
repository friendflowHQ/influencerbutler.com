// Before-you-book requirements for 1:1 calls.
//
// Owner decision (2026-11-23): calls kept turning into the owner watching a
// customer do work they could have done alone (finding photos, signing in,
// connecting an account) because nothing asked them to prepare. So every
// booking from the website now needs the customer to confirm, per topic they
// picked, that they did the guided setup and have the material ready, and to
// say what they already tried.
//
// This is an attestation, not a proof: the website cannot see whether a
// guided walkthrough was really finished. The answers are saved on the booking
// (see summarizeCallPrereqs) so the owner can read them before the call and
// end a call that was not prepared for. Where the desktop app has reported its
// per-butler setup status, src/lib/setup-snapshot.ts verifies the mapped items
// (refuses a booking with the exact missing steps, no tick needed for a done one).
//
// Pure module (shared by the booking page, the create route and the emails),
// unit-tested in src/lib/__tests__/call-prerequisites.test.ts.

import { guessTopics, sanitizeTopics, topicLabel } from "@/lib/call-topics";
import type { CallTypeKey } from "@/lib/scheduling";

export const CALL_PREREQ_CODE = "prereq_required";

export type Prereq = { id: string; text: string; helpSlug?: string };

/** Topics that need no preparation checklist at all (billing questions are answered live). */
const NO_GENERAL_TOPICS = new Set(["billing"]);

const COMPUTER: Prereq = {
  id: "general.computer",
  text: "I will be at my computer with the Influencer Butler app open and signed in when the call starts.",
};
const ASKED_AI: Prereq = {
  id: "general.ai",
  text: "I asked Butler AI (the chat bubble) about this and tried what it suggested.",
  helpSlug: "ai-concierge",
};

const BY_TOPIC: Record<string, Prereq[]> = {
  "facebook-deals": [
    { id: "facebook-deals.guide", text: "I finished the Deals guided setup in the app.", helpSlug: "deals-guided-setup" },
    { id: "facebook-deals.link", text: "I have the link to my Facebook Page or group ready to paste." },
  ],
  "deals-butler": [
    { id: "deals-butler.guide", text: "I finished the Deals guided setup in the app.", helpSlug: "deals-guided-setup" },
    { id: "deals-butler.ready", text: "I know which products, keywords or categories I want to post. The call is not for browsing." },
  ],
  foyer: [
    { id: "foyer.guide", text: "I read the Foyer Butler guide and started my page.", helpSlug: "foyer-butler" },
    { id: "foyer.assets", text: "My links, logo and photos are saved on this computer, ready to use." },
  ],
  instagram: [
    { id: "instagram.guide", text: "I connected Instagram from the Setup Checklist in the app.", helpSlug: "instagram" },
  ],
  amazon: [
    { id: "amazon.signin", text: "I am signed in to Amazon inside the app and my storefront ID is entered.", helpSlug: "amazonbutler" },
    { id: "amazon.checklist", text: "I cleared the required items in the Setup Checklist (left menu) that apply to me." },
  ],
  "mavely-walmart": [
    { id: "mavely-walmart.signin", text: "I am signed in to Walmart or Mavely inside the app and watched the guide.", helpSlug: "walmart-research" },
  ],
  youtube: [
    { id: "youtube.guide", text: "I connected my YouTube channel in the app and read the guide.", helpSlug: "youtube-butler" },
  ],
  extension: [
    { id: "extension.guide", text: "The Chrome extension is installed and I followed the extension guide.", helpSlug: "extension" },
  ],
  broken: [
    { id: "broken.report", text: "I used Report a bug in the chat bubble so the team has my logs." },
    { id: "broken.detail", text: "I have the exact error message or a screenshot ready." },
  ],
  "ai-influencer": [
    { id: "ai-influencer.guide", text: "I followed the AI Influencer setup guide.", helpSlug: "ai-influencer-setup" },
    { id: "ai-influencer.photos", text: "My photos for the AI clone are chosen and saved in one folder on this computer BEFORE the call. We will not use the call to look for pictures." },
    { id: "ai-influencer.key", text: "My OpenAI key is connected under AI & Data Keys in the app." },
  ],
};

/** Prerequisites for a set of topics and a call type, general items first, de-duplicated. */
export function prereqsFor(topicKeys: string[] | null | undefined, type: CallTypeKey): Prereq[] {
  const keys = sanitizeTopics(topicKeys ?? []);
  const out: Prereq[] = [];
  const add = (p: Prereq) => { if (!out.some((o) => o.id === p.id)) out.push(p); };
  const needsGeneral = keys.length === 0 || keys.some((k) => !NO_GENERAL_TOPICS.has(k));
  if (needsGeneral) {
    add(COMPUTER);
    // The Setup call is for things nobody has tried yet, so "asked the AI first" only applies to troubleshooting.
    if (type === "support") add(ASKED_AI);
  }
  for (const k of keys) for (const p of BY_TOPIC[k] ?? []) add(p);
  return out;
}

export const TRIED_MIN_CHARS: Record<"support" | "demo", number> = { support: 40, demo: 25 };

export function triedQuestion(type: CallTypeKey): string {
  return type === "support"
    ? "What did you already try, and what happened? (the exact message or behavior helps)"
    : "What should be working by the end of the call?";
}

export type CallPrereqAnswers = { ack?: unknown; tried?: unknown };

function cleanAnswers(raw: unknown): { ack: string[]; tried: string } {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as CallPrereqAnswers;
  const ack = Array.isArray(r.ack) ? r.ack.filter((x): x is string => typeof x === "string").map((x) => x.trim()).slice(0, 40) : [];
  const tried = typeof r.tried === "string" ? r.tried.trim().slice(0, 1500) : "";
  return { ack, tried };
}

export type CallPrereqVerdict =
  | { ok: true; ack: string[]; tried: string }
  | { ok: false; status: 422; code: typeof CALL_PREREQ_CODE; error: string; missing: string[] };

/** True unless the kill switch CALL_PREREQS_REQUIRED=0 is set. */
export function callPrereqsRequired(env: Record<string, string | undefined> = process.env): boolean {
  return env.CALL_PREREQS_REQUIRED !== "0";
}

export const CALL_PREREQ_ERROR =
  "Before booking, please confirm the quick checklist on the booking page and tell us what you already tried. " +
  "It takes a minute and means your call is spent on your goals, not on setup.";

export function checkCallPrereqs(opts: {
  type: CallTypeKey;
  topics: string[] | null | undefined;
  raw: unknown;
  /** False for app, extension and phone bookings (they have their own pre-call flow). */
  viaWebsite: boolean;
  required?: boolean;
  /** Checklist items the desktop app's setup snapshot already proves (src/lib/setup-snapshot.ts); no tick needed. */
  verified?: string[];
}): CallPrereqVerdict {
  const { ack: ticked, tried } = cleanAnswers(opts.raw);
  const ack = [...ticked, ...(opts.verified ?? []).filter((id) => !ticked.includes(id))];
  if (!(opts.required ?? callPrereqsRequired()) || !opts.viaWebsite) return { ok: true, ack, tried };
  const need = prereqsFor(opts.topics, opts.type);
  const missing = need.filter((p) => !ack.includes(p.id)).map((p) => p.id);
  const min = TRIED_MIN_CHARS[opts.type === "support" ? "support" : "demo"];
  // Billing-only questions need no history of tries.
  const billingOnly = need.length === 0;
  if (missing.length > 0 || (!billingOnly && tried.length < min)) {
    return { ok: false, status: 422, code: CALL_PREREQ_CODE, error: CALL_PREREQ_ERROR, missing };
  }
  return { ok: true, ack, tried };
}

/** Owner-facing text stored with the booking (prep sheet) and shown in the owner email. */
export function summarizeCallPrereqs(opts: { type: CallTypeKey; topics: string[]; ack: string[]; tried: string }): string {
  const keys = sanitizeTopics(opts.topics);
  const confirmed = prereqsFor(keys, opts.type).filter((p) => opts.ack.includes(p.id)).map((p) => p.text);
  const lines = [
    keys.length ? `Topic keys: ${keys.join(", ")}` : "",
    confirmed.length ? `Customer confirmed before booking:\n${confirmed.map((t) => `- ${t}`).join("\n")}` : "",
    opts.tried ? `${opts.type === "support" ? "Already tried" : "Wants working by the end"}: ${opts.tried}` : "",
  ].filter(Boolean);
  return lines.length ? `\n\n[Booking prep]\n${lines.join("\n")}` : "";
}

/** Recover topic keys from the stored topic text (summary line first, keyword guess as a fallback). */
export function topicKeysFromText(text: string | null | undefined): string[] {
  const m = /Topic keys:\s*([a-z0-9,\s-]+)/i.exec(text || "");
  if (m) {
    const keys = sanitizeTopics(m[1]!.split(",").map((s) => s.trim()));
    if (keys.length) return keys;
  }
  return guessTopics(text);
}

/** True when emails should carry the preparation section (off until the guided walkthroughs release). */
export function callPrepEmailEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.CALL_PREP_EMAIL === "1";
}

const SITE = "https://www.influencerbutler.com";

/**
 * The "do these first" block for confirmation, reminder and notice emails.
 * Empty unless CALL_PREP_EMAIL=1 (or `force`, used by the one-off notice route).
 */
export function callPrepEmailLines(opts: {
  type: CallTypeKey;
  topics?: string[] | null;
  topicText?: string | null;
  force?: boolean;
  env?: Record<string, string | undefined>;
}): string[] {
  if (!opts.force && !callPrepEmailEnabled(opts.env)) return [];
  const keys = sanitizeTopics(opts.topics ?? []);
  const topics = keys.length ? keys : topicKeysFromText(opts.topicText);
  const items = prereqsFor(topics, opts.type);
  const labels = topics.map(topicLabel).join(", ");
  const lines = [
    ``,
    `To make the most of your time, please do these before the call${labels ? ` (${labels})` : ""}:`,
    ...items.map((p) => `- ${p.text}${p.helpSlug ? ` Guide: ${SITE}/help/tutorials/${p.helpSlug}` : ""}`),
    ``,
    `Where to find the guided setups: in the app, open Setup Checklist in the left menu, and in Settings choose First-run walkthrough. Butler AI (the chat bubble) can walk you through any step, any time.`,
    `If the setup is not done when we meet, we will ask to reschedule so the call is useful.`,
  ];
  return lines;
}
