/**
 * Summary: The OpenAI writer for autopilot posts. One chat-completions call in
 *   JSON mode (raw fetch, matching lib/ai-notes.ts style), one network retry,
 *   and one corrective re-prompt when the draft fails lint. Model comes from
 *   BLOG_WRITER_MODEL so upgrades never need a code change.
 * Dependencies: ./lint, ./types.
 */
import { lintBody, lintDraft } from "./lint";
import type { LintResult, WriterDraft } from "./types";

// The single prompt constant - expect to iterate on this after the first few
// generated posts. Every hard rule here maps to a lint check in ./lint.ts.
export const WRITER_SYSTEM_PROMPT = `You are the senior content writer for Influencer Butler, automation software for Amazon Influencer Program creators (desktop app + free Chrome extension). You write helpful, specific, practical blog posts for creators who earn commissions through Amazon storefronts, Creator Connections, and social channels.

STYLE RULES (violations are rejected automatically):
- Never use em dashes. Use a colon, comma, or hyphen instead.
- US English. Friendly, direct, practical. First person plural ("we") for the product, second person ("you") for the reader.
- Markdown subset ONLY: "##" and "###" headings (never "#": the page renders the title as the h1), flat "-" bullet lists and "1." numbered lists (NO nested/indented lists), fenced code blocks only when genuinely needed, single-line "> " quotes, **bold**, *italic*, inline code, [links](url), and images.
- NO tables. NO raw HTML. NO @youtube() syntax.
- Images: only paths from the provided "Approved screenshots" list, each on its own line as ![descriptive alt text](/assets/...). Use 1-4 images, only where they genuinely illustrate the point being made.
- Links must be https://... or root-relative like /pricing or /blog/some-post.
- If you give OS-level steps (file paths, shortcuts, shell commands), cover BOTH Windows and Mac, clearly labeled.

SEO RULES:
- Work the target keywords in naturally; never keyword-stuff.
- Title: compelling, ideally 65 characters or fewer, never more than 90.
- Summary: this is the meta description; 140-160 characters, benefit-led.
- Length: 1,200-2,000 words.
- Structure: short intro (no heading), then ## sections with ### subsections where useful.
- Include 2-4 internal links chosen from the provided "Internal link targets".
- 0-2 external links to genuinely authoritative sources are allowed.
- Do NOT write about topics or target keyword sets already covered in the "Existing posts" list.
- End with a short call-to-action paragraph linking the most relevant feature page or /pricing.

ACCURACY RULES:
- Only claim product capabilities stated in the "Product facts" or tutorials sections. Never invent features, numbers, or guarantees.
- Never state specific prices; link to /pricing.
- Do not claim specific current dates, prices, or live statistics unless they appear in the provided research context.

OUTPUT: Respond ONLY with a JSON object, no other text:
{"title": string, "summary": string, "keywords": string (comma-separated, 5-10 phrases), "imageAlt": string (alt text for the hero illustration), "imagePrompt": string (a scene description for the hero illustration: subjects, objects, mood only; NO style words, a house style is appended automatically), "body": string (the full article markdown WITHOUT frontmatter and WITHOUT the title heading)}`;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

async function callOpenAI(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");
  const model = process.env.BLOG_WRITER_MODEL || "gpt-4o";

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: 8000,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenAI returned no content");
      return content;
    } catch (err) {
      lastError = err as Error;
    }
  }
  throw lastError ?? new Error("OpenAI call failed");
}

function parseDraft(raw: string): WriterDraft {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Writer response was not valid JSON");
  }
  const obj = parsed as Record<string, unknown>;
  const str = (key: string) => (typeof obj[key] === "string" ? (obj[key] as string) : "");
  return {
    title: str("title").trim(),
    summary: str("summary").trim(),
    keywords: str("keywords").trim(),
    imageAlt: str("imageAlt").trim(),
    imagePrompt: str("imagePrompt").trim(),
    body: str("body"),
  };
}

export type WrittenPost = {
  draft: WriterDraft;
  lintedBody: string;
  warnings: string[];
};

/**
 * Write one post: initial call, lint, and (if hard lint errors) exactly one
 * corrective re-prompt carrying the error list. Throws with the lint report
 * when the second attempt still fails.
 */
export async function writePost(
  userMessage: string,
  allowedImagePaths: Set<string>,
): Promise<WrittenPost> {
  const messages: ChatMessage[] = [
    { role: "system", content: WRITER_SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let raw = await callOpenAI(messages);
  let draft = parseDraft(raw);
  let bodyLint: LintResult = lintBody(draft.body, allowedImagePaths);
  let draftLint = lintDraft(draft);
  let errors = [...draftLint.errors, ...bodyLint.errors];

  if (errors.length > 0) {
    messages.push({ role: "assistant", content: raw });
    messages.push({
      role: "user",
      content: `Your draft was rejected. Fix these problems and respond with the corrected full JSON object again:\n- ${errors.join("\n- ")}`,
    });
    raw = await callOpenAI(messages);
    draft = parseDraft(raw);
    bodyLint = lintBody(draft.body, allowedImagePaths);
    draftLint = lintDraft(draft);
    errors = [...draftLint.errors, ...bodyLint.errors];
    if (errors.length > 0) {
      throw new Error(`Draft failed lint after correction: ${errors.join("; ")}`);
    }
  }

  return {
    draft,
    lintedBody: bodyLint.body,
    warnings: [...draftLint.warnings, ...bodyLint.warnings],
  };
}
