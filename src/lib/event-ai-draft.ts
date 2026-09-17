/**
 * AI drafting for the event planner: given a title + time (and optional notes),
 * draft the event description and the invite/replay email copy for the admin to
 * review before anything is created. Nothing is saved here; the route returns
 * the draft and the admin edits it in the form.
 *
 * Reuses the text-path provider resolver (Groq first, OpenAI fallback) from
 * ai-concierge/llm.ts, the same JSON-mode call pattern as support-sweep. No em
 * dashes in any generated copy (repo rule) - the prompt forbids them and we
 * strip any that slip through.
 */
import { DateTime } from "luxon";
import { resolveTextProvider, openAiFallbackProvider } from "@/lib/ai-concierge/llm";

const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

export type EventDraftInput = {
  title: string;
  startMs: number;
  endMs: number;
  timezone: string;
  notes?: string | null;
};

export type EventDraft = {
  description: string;
  inviteSubject: string;
  inviteBody: string;
  replaySubject: string;
  replayBody: string;
};

const BRAND = [
  "Influencer Butler is automation software for Amazon (and Walmart) influencers:",
  "it runs butlers that post deals, auto-accept Creator Connections campaigns, do brand",
  "outreach, and turn storefronts and lists into commission. The events are free live",
  "group sessions (webinar style) hosted by the Influencer Butler team for creators.",
].join(" ");

const SYSTEM = [
  "You write concise, warm, concrete marketing copy for Influencer Butler.",
  BRAND,
  "You are drafting content for one upcoming live event, for the team to review.",
  "Return ONLY a JSON object with these string keys:",
  "  description  - 2 to 4 sentences describing the event for the event page and",
  "                 calendar. Say what it covers, who it is for, and what to bring.",
  "  inviteSubject- a short email subject line inviting people to register.",
  "  inviteBody   - a plain-text invite email body driving registration. Put the",
  "                 literal token {{EVENT_URL}} on its own line where the register",
  "                 link belongs. Do NOT invent a URL. Sign off as",
  "                 'The Influencer Butler team'.",
  "  replaySubject- a short subject line for the after-event replay email.",
  "  replayBody   - a plain-text email body sharing the replay. Put the literal",
  "                 token {{REPLAY_URL}} where the replay link belongs. Do NOT",
  "                 invent a URL.",
  "Rules: friendly and specific, not hypey. Keep each email under 180 words.",
  "Never use an em dash or en dash. Use a colon, comma, or hyphen instead.",
  "Do not fabricate prices, dates, guarantees, or speaker names.",
].join("\n");

/** Removes em/en dashes from generated copy, replacing them with a hyphen. */
function stripDashes(s: string): string {
  return s.split(EM_DASH).join("-").split(EN_DASH).join("-");
}

function str(v: unknown, max: number): string {
  return typeof v === "string" ? stripDashes(v).trim().slice(0, max) : "";
}

async function callJson(system: string, user: string): Promise<Record<string, unknown> | null> {
  const providers = [resolveTextProvider(), openAiFallbackProvider()].filter(
    (p): p is NonNullable<typeof p> => !!p,
  );
  const seen = new Set<string>();
  for (const provider of providers) {
    if (seen.has(provider.url)) continue;
    seen.add(provider.url);
    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.5,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        console.error("[event-ai-draft] provider HTTP", provider.kind, res.status);
        continue;
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const content = json.choices?.[0]?.message?.content;
      if (!content) continue;
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      console.error("[event-ai-draft] provider threw", provider.kind, err);
    }
  }
  return null;
}

export function isDraftConfigured(): boolean {
  return resolveTextProvider() !== null || openAiFallbackProvider() !== null;
}

/**
 * Drafts the event description + invite/replay copy. Returns null when no LLM
 * provider is configured or every provider call failed. The caller reviews and
 * edits the result before anything is created.
 */
export async function draftEventContent(input: EventDraftInput): Promise<EventDraft | null> {
  const tz = input.timezone || "America/Denver";
  const start = DateTime.fromMillis(input.startMs, { zone: tz });
  const end = DateTime.fromMillis(input.endMs, { zone: tz });
  const when = `${start.toFormat("cccc, LLLL d, yyyy")}, ${start.toFormat("h:mm a")} to ${end.toFormat("h:mm a")} ${start.toFormat("ZZZZ")}`;

  const user = [
    `Event title: ${input.title}`,
    `When: ${when}`,
    input.notes ? `Notes from the host: ${input.notes}` : "",
    "",
    "Draft the description and the invite and replay emails now.",
  ]
    .filter(Boolean)
    .join("\n");

  const raw = await callJson(SYSTEM, user);
  if (!raw) return null;

  const draft: EventDraft = {
    description: str(raw.description, 5000),
    inviteSubject: str(raw.inviteSubject, 200),
    inviteBody: str(raw.inviteBody, 10000),
    replaySubject: str(raw.replaySubject, 200),
    replayBody: str(raw.replayBody, 10000),
  };
  // A usable draft must at least have a description and an invite body.
  if (!draft.description || !draft.inviteBody) return null;
  return draft;
}
