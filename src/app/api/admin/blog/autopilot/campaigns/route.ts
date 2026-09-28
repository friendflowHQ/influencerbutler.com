/**
 * POST /api/admin/blog/autopilot/campaigns - save a campaign + its (possibly
 * edited) topic items into the queue. Re-validates slot occupancy server-side
 * (the proposal may be stale) and shifts collisions forward. One [vercel skip]
 * queue commit; 409 when the queue moved since the admin loaded it.
 * Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { BLOG_CATEGORIES, loadManifestFromGitHub } from "@/app/api/admin/blog/shared";
import { ConflictError } from "@/lib/github-content";
import { loadQueue } from "@/lib/blog-autogen/queue";
import { allocateSlots } from "@/lib/blog-autogen/schedule";
import type { Campaign, QueueItem } from "@/lib/blog-autogen/types";
import { commitQueue, dedupeSlug, envError, slugify } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SaveBody = {
  campaign?: {
    id?: unknown;
    theme?: unknown;
    notes?: unknown;
    cadenceDays?: unknown;
    categoryMix?: unknown;
  };
  items?: unknown;
  expectedHeadSha?: unknown;
};

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const env = envError();
  if (env) return env;

  let body: SaveBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const theme = String(body.campaign?.theme ?? "").trim().slice(0, 500);
  if (!theme) return NextResponse.json({ error: "campaign.theme is required" }, { status: 400 });
  const rawItems = Array.isArray(body.items) ? body.items : [];
  if (!rawItems.length) return NextResponse.json({ error: "items are required" }, { status: 400 });
  const expectedHeadSha =
    typeof body.expectedHeadSha === "string" ? body.expectedHeadSha : undefined;

  try {
    const [manifest, queue] = await Promise.all([loadManifestFromGitHub(), loadQueue()]);
    const now = new Date().toISOString();

    const cadenceDays = Math.min(30, Math.max(1, Number(body.campaign?.cadenceDays) || 7));
    const campaign: Campaign = {
      id: dedupeSlug(
        String(body.campaign?.id ?? "") ||
          `cmp-${slugify(theme).slice(0, 40)}-${now.slice(0, 7)}`,
        new Set(queue.campaigns.map((c) => c.id)),
      ),
      theme,
      notes: String(body.campaign?.notes ?? "").trim().slice(0, 1000) || undefined,
      cadenceDays,
      categoryMix: Array.isArray(body.campaign?.categoryMix)
        ? body.campaign.categoryMix.filter((c): c is string => typeof c === "string")
        : [],
      status: "active",
      createdAt: now,
      createdBy: actor.email ?? "",
    };

    const taken = new Set<string>([
      ...manifest.posts.map((p) => p.id),
      ...queue.items.map((i) => i.slug),
    ]);
    const topics = rawItems
      .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
      .map((t) => {
        const title = String(t.title ?? "").trim().slice(0, 90);
        const slug = dedupeSlug(
          String(t.slug ?? "").trim() || slugify(title),
          taken,
        );
        taken.add(slug);
        return {
          slug,
          title,
          summary: String(t.summary ?? "").trim().slice(0, 300),
          keywords: String(t.keywords ?? "").trim().slice(0, 500),
          category: (BLOG_CATEGORIES as readonly string[]).includes(String(t.category))
            ? String(t.category)
            : "Growth",
          requestedDate:
            typeof t.publishDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.publishDate)
              ? t.publishDate
              : undefined,
        };
      })
      .filter((t) => t.title);

    // Re-allocate with fresh occupancy; honor the earliest requested date as
    // the batch start so admin edits to dates mostly stick.
    const startDate = topics
      .map((t) => t.requestedDate)
      .filter((d): d is string => Boolean(d))
      .sort()[0];
    const allocated = allocateSlots(
      topics,
      {
        startDate,
        cadenceDays,
        maxPerDay: queue.settings.maxPerDay,
        leadDays: queue.settings.leadDays,
      },
      manifest.posts,
      queue,
    );

    const items: QueueItem[] = allocated.map((t) => ({
      id: `q-${t.slug}`,
      campaignId: campaign.id,
      slug: t.slug,
      title: t.title,
      summary: t.summary,
      keywords: t.keywords,
      category: t.category,
      publishDate: t.publishDate,
      generateOn: t.generateOn,
      status: "queued",
      attempts: 0,
      lastError: null,
      generatedAt: null,
      createdAt: now,
    }));

    queue.campaigns.push(campaign);
    queue.items.push(...items);

    const commitSha = await commitQueue(
      queue,
      `campaign ${campaign.id} (+${items.length} topics)`,
      actor.email ?? "",
      expectedHeadSha,
    );

    await logAdminAction({
      actor,
      action: "blog.autopilot.campaign.create",
      targetType: "blog_campaign",
      targetId: campaign.id,
      details: { items: items.length, commitSha },
    });

    return NextResponse.json({ campaign, items, commitSha }, { status: 201 });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: "Queue changed since you loaded it. Reload and try again." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Save failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
