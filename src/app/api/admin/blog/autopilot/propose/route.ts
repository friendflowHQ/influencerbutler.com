/**
 * POST /api/admin/blog/autopilot/propose - AI-propose a campaign's topic list.
 * Body: { theme, count, cadenceDays, categoryMix?, notes?, startDate? }
 * Returns { campaignDraft, proposedItems } with slot-allocated dates. Nothing
 * is committed; the admin edits the list then POSTs /campaigns to save.
 * Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { BLOG_CATEGORIES, loadManifestFromGitHub } from "@/app/api/admin/blog/shared";
import { loadQueue } from "@/lib/blog-autogen/queue";
import { allocateSlots } from "@/lib/blog-autogen/schedule";
import { dedupeSlug, envError, slugify } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PROPOSER_SYSTEM = `You plan blog content for Influencer Butler, automation software for Amazon Influencer Program creators (desktop app with automation "butlers" + a free Chrome extension). Given a campaign theme, propose distinct, non-overlapping post topics that creators would search for. Respond ONLY with JSON: {"topics": [{"title": string (<=65 chars), "summary": string (140-160 chars, meta description), "keywords": string (comma-separated, 5-8 phrases), "category": string}]}. Categories must come from the provided list. Never propose a topic that duplicates or closely overlaps the provided existing posts.`;

type ProposeBody = {
  theme?: unknown;
  count?: unknown;
  cadenceDays?: unknown;
  categoryMix?: unknown;
  notes?: unknown;
  startDate?: unknown;
};

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const env = envError();
  if (env) return env;
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: ProposeBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const theme = String(body.theme ?? "").trim().slice(0, 500);
  if (!theme) return NextResponse.json({ error: "theme is required" }, { status: 400 });
  const count = Math.min(60, Math.max(1, Number(body.count) || 10));
  const cadenceDays = Math.min(30, Math.max(1, Number(body.cadenceDays) || 7));
  const categoryMix = Array.isArray(body.categoryMix)
    ? body.categoryMix.filter(
        (c): c is string => typeof c === "string" && (BLOG_CATEGORIES as readonly string[]).includes(c),
      )
    : [];
  const notes = String(body.notes ?? "").trim().slice(0, 1000);
  const startDate =
    typeof body.startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.startDate)
      ? body.startDate
      : undefined;

  try {
    const [manifest, queue] = await Promise.all([loadManifestFromGitHub(), loadQueue()]);

    const existing = manifest.posts
      .map((p) => `${p.title} | ${p.keywords}`)
      .concat(queue.items.filter((i) => i.status === "queued").map((i) => `${i.title} | ${i.keywords}`))
      .slice(0, 200)
      .join("\n");

    const userMessage = [
      `Theme: ${theme}`,
      notes ? `Notes: ${notes}` : "",
      `Propose exactly ${count} topics.`,
      `Allowed categories: ${(categoryMix.length ? categoryMix : BLOG_CATEGORIES).join(", ")}`,
      "",
      "Existing posts and queued topics (do not duplicate):",
      existing,
    ]
      .filter(Boolean)
      .join("\n");

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.BLOG_WRITER_MODEL || "gpt-4o",
        messages: [
          { role: "system", content: PROPOSER_SYSTEM },
          { role: "user", content: userMessage },
        ],
        temperature: 0.8,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `OpenAI ${res.status}: ${text.slice(0, 300)}` },
        { status: 502 },
      );
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    let topics: Array<{ title: string; summary: string; keywords: string; category: string }>;
    try {
      const parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}") as {
        topics?: unknown;
      };
      topics = (Array.isArray(parsed.topics) ? parsed.topics : [])
        .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
        .map((t) => ({
          title: String(t.title ?? "").slice(0, 90),
          summary: String(t.summary ?? "").slice(0, 300),
          keywords: String(t.keywords ?? "").slice(0, 500),
          category: (BLOG_CATEGORIES as readonly string[]).includes(String(t.category))
            ? String(t.category)
            : (categoryMix[0] ?? "Growth"),
        }))
        .filter((t) => t.title);
    } catch {
      return NextResponse.json({ error: "Proposal response was not valid JSON" }, { status: 502 });
    }
    if (!topics.length) {
      return NextResponse.json({ error: "No topics proposed" }, { status: 502 });
    }

    // Slugs + slot allocation.
    const taken = new Set<string>([
      ...manifest.posts.map((p) => p.id),
      ...queue.items.map((i) => i.slug),
    ]);
    const withSlugs = topics.slice(0, count).map((t) => {
      const slug = dedupeSlug(slugify(t.title), taken);
      taken.add(slug);
      return { ...t, slug };
    });
    const allocated = allocateSlots(
      withSlugs,
      {
        startDate,
        cadenceDays,
        maxPerDay: queue.settings.maxPerDay,
        leadDays: queue.settings.leadDays,
      },
      manifest.posts,
      queue,
    );

    const campaignDraft = {
      id: dedupeSlug(
        `cmp-${slugify(theme).slice(0, 40)}-${new Date().toISOString().slice(0, 7)}`,
        new Set(queue.campaigns.map((c) => c.id)),
      ),
      theme,
      notes: notes || undefined,
      cadenceDays,
      categoryMix: categoryMix.length ? categoryMix : [...BLOG_CATEGORIES],
    };

    return NextResponse.json({ campaignDraft, proposedItems: allocated });
  } catch (error) {
    return NextResponse.json(
      { error: `Proposal failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
