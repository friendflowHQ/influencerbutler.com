/**
 * PATCH /api/admin/blog/autopilot/items/[id] - edit one queue item.
 * Body: { action: "update"|"reschedule"|"cancel"|"retry", fields?, expectedHeadSha? }
 * - update: title/summary/keywords/category/brief/researchUrls (queued items only)
 * - reschedule: fields.publishDate (+ optional fields.dayOf), occupancy-checked
 * - cancel: any queued/failed item
 * - retry: failed item back to queued with attempts reset
 * Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { BLOG_CATEGORIES, loadManifestFromGitHub } from "@/app/api/admin/blog/shared";
import { ConflictError } from "@/lib/github-content";
import { loadQueue } from "@/lib/blog-autogen/queue";
import { addDays, dateHasRoom, todayISO } from "@/lib/blog-autogen/schedule";
import { commitQueue, envError } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const env = envError();
  if (env) return env;

  const { id } = await context.params;

  let body: { action?: unknown; fields?: Record<string, unknown>; expectedHeadSha?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const fields = body.fields ?? {};
  const expectedHeadSha =
    typeof body.expectedHeadSha === "string" ? body.expectedHeadSha : undefined;

  try {
    const [manifest, queue] = await Promise.all([loadManifestFromGitHub(), loadQueue()]);
    const item = queue.items.find((i) => i.id === id);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

    switch (action) {
      case "update": {
        if (item.status !== "queued") {
          return NextResponse.json({ error: "Only queued items can be edited" }, { status: 400 });
        }
        if (typeof fields.title === "string" && fields.title.trim()) {
          item.title = fields.title.trim().slice(0, 90);
        }
        if (typeof fields.summary === "string") item.summary = fields.summary.trim().slice(0, 300);
        if (typeof fields.keywords === "string" && fields.keywords.trim()) {
          item.keywords = fields.keywords.trim().slice(0, 500);
        }
        if (
          typeof fields.category === "string" &&
          (BLOG_CATEGORIES as readonly string[]).includes(fields.category)
        ) {
          item.category = fields.category;
        }
        if (typeof fields.brief === "string") {
          item.brief = fields.brief.trim().slice(0, 1000) || undefined;
        }
        if (Array.isArray(fields.researchUrls)) {
          const urls = fields.researchUrls
            .filter((u): u is string => typeof u === "string" && /^https?:\/\//i.test(u))
            .slice(0, 3);
          item.researchUrls = urls.length ? urls : undefined;
        }
        break;
      }
      case "reschedule": {
        if (item.status !== "queued") {
          return NextResponse.json(
            { error: "Only queued items can be rescheduled" },
            { status: 400 },
          );
        }
        const publishDate = String(fields.publishDate ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(publishDate) || publishDate <= todayISO()) {
          return NextResponse.json(
            { error: "publishDate must be a future yyyy-mm-dd" },
            { status: 400 },
          );
        }
        if (
          !dateHasRoom(publishDate, queue.settings.maxPerDay, manifest.posts, queue, item.id)
        ) {
          return NextResponse.json(
            { error: `${publishDate} already has ${queue.settings.maxPerDay} post(s)` },
            { status: 400 },
          );
        }
        item.publishDate = publishDate;
        const today = todayISO();
        const generated = fields.dayOf === true
          ? publishDate
          : addDays(publishDate, -queue.settings.leadDays);
        item.generateOn = generated < today ? today : generated;
        break;
      }
      case "cancel": {
        if (item.status === "generated") {
          return NextResponse.json(
            { error: "Already generated; edit or park the post itself instead" },
            { status: 400 },
          );
        }
        item.status = "cancelled";
        break;
      }
      case "retry": {
        if (item.status !== "failed") {
          return NextResponse.json({ error: "Only failed items can be retried" }, { status: 400 });
        }
        item.status = "queued";
        item.attempts = 0;
        item.lastError = null;
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const commitSha = await commitQueue(queue, `${action} ${item.slug}`, actor.email ?? "", expectedHeadSha);

    await logAdminAction({
      actor,
      action: `blog.autopilot.item.${action}`,
      targetType: "blog_queue_item",
      targetId: item.id,
      details: { commitSha },
    });

    return NextResponse.json({ item, commitSha });
  } catch (error) {
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { error: "Queue changed since you loaded it. Reload and try again." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Update failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
