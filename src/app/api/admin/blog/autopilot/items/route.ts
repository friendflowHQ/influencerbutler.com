/**
 * POST /api/admin/blog/autopilot/items - queue a one-off (often timely) post.
 * Body: { title, summary?, keywords, category, publishDate, dayOf?: boolean,
 *         researchUrls?: string[], brief?, expectedHeadSha? }
 * dayOf=true generates the morning it publishes (freshest content); otherwise
 * generateOn = publishDate - leadDays. Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { BLOG_CATEGORIES, loadManifestFromGitHub } from "@/app/api/admin/blog/shared";
import { ConflictError } from "@/lib/github-content";
import { loadQueue } from "@/lib/blog-autogen/queue";
import { addDays, dateHasRoom, todayISO } from "@/lib/blog-autogen/schedule";
import type { QueueItem } from "@/lib/blog-autogen/types";
import { commitQueue, dedupeSlug, envError, slugify } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const env = envError();
  if (env) return env;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim().slice(0, 90);
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });
  const keywords = String(body.keywords ?? "").trim().slice(0, 500);
  if (!keywords) return NextResponse.json({ error: "keywords are required" }, { status: 400 });
  const publishDate = String(body.publishDate ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate)) {
    return NextResponse.json({ error: "publishDate must be yyyy-mm-dd" }, { status: 400 });
  }
  const today = todayISO();
  if (publishDate <= today) {
    return NextResponse.json({ error: "publishDate must be in the future" }, { status: 400 });
  }
  const category = (BLOG_CATEGORIES as readonly string[]).includes(String(body.category))
    ? String(body.category)
    : "Growth";
  const dayOf = body.dayOf === true;
  const researchUrls = Array.isArray(body.researchUrls)
    ? body.researchUrls
        .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
        .slice(0, 3)
    : undefined;
  const expectedHeadSha =
    typeof body.expectedHeadSha === "string" ? body.expectedHeadSha : undefined;

  try {
    const [manifest, queue] = await Promise.all([loadManifestFromGitHub(), loadQueue()]);

    if (!dateHasRoom(publishDate, queue.settings.maxPerDay, manifest.posts, queue)) {
      return NextResponse.json(
        { error: `${publishDate} already has ${queue.settings.maxPerDay} post(s) scheduled` },
        { status: 400 },
      );
    }

    const taken = new Set<string>([
      ...manifest.posts.map((p) => p.id),
      ...queue.items.map((i) => i.slug),
    ]);
    const slug = dedupeSlug(slugify(title), taken);
    const generateOn = dayOf
      ? publishDate
      : (() => {
          const g = addDays(publishDate, -queue.settings.leadDays);
          return g < today ? today : g;
        })();

    const item: QueueItem = {
      id: `q-${slug}`,
      slug,
      title,
      summary: String(body.summary ?? "").trim().slice(0, 300),
      keywords,
      category,
      publishDate,
      generateOn,
      brief: String(body.brief ?? "").trim().slice(0, 1000) || undefined,
      researchUrls,
      status: "queued",
      attempts: 0,
      lastError: null,
      generatedAt: null,
      createdAt: new Date().toISOString(),
    };
    queue.items.push(item);

    const commitSha = await commitQueue(
      queue,
      `queue one-off ${slug}`,
      actor.email ?? "",
      expectedHeadSha,
    );

    await logAdminAction({
      actor,
      action: "blog.autopilot.item.create",
      targetType: "blog_queue_item",
      targetId: item.id,
      details: { publishDate, dayOf, commitSha },
    });

    return NextResponse.json({ item, commitSha }, { status: 201 });
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
