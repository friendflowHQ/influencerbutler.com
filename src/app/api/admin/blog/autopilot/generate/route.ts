/**
 * POST /api/admin/blog/autopilot/generate - generate one queued item RIGHT NOW
 * (same pipeline the cron uses). Body: { itemId }. Takes 1-3 minutes; the UI
 * shows a spinner. On failure the attempt is recorded in the queue exactly as
 * a cron failure would be. Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { loadManifestFromGitHub } from "@/app/api/admin/blog/shared";
import { commitFiles, getHead } from "@/lib/github-content";
import { generateOne } from "@/lib/blog-autogen/generate";
import { QUEUE_PATH, loadQueue, serializeQueue } from "@/lib/blog-autogen/queue";
import { envError } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const env = envError();
  if (env) return env;
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY not configured" }, { status: 500 });
  }

  let body: { itemId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const itemId = String(body.itemId ?? "");
  if (!itemId) return NextResponse.json({ error: "itemId is required" }, { status: 400 });

  try {
    const [queue, manifest, head] = await Promise.all([
      loadQueue(),
      loadManifestFromGitHub(),
      getHead(),
    ]);
    const item = queue.items.find((i) => i.id === itemId);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    if (item.status !== "queued" && item.status !== "failed") {
      return NextResponse.json(
        { error: `Item is ${item.status}; only queued or failed items can generate` },
        { status: 400 },
      );
    }
    if (item.status === "failed") {
      item.status = "queued";
      item.attempts = 0;
      item.lastError = null;
    }

    const world = { manifest, queue, headSha: head.commitSha };
    try {
      const outcome = await generateOne(item, world);
      await logAdminAction({
        actor,
        action: "blog.autopilot.generate",
        targetType: "blog_post",
        targetId: item.slug,
        details: { commitSha: outcome.commitSha },
      });
      return NextResponse.json({
        ok: true,
        entry: outcome.entry,
        commitSha: outcome.commitSha,
        warnings: outcome.warnings,
        alreadyExisted: outcome.alreadyExisted ?? false,
      });
    } catch (error) {
      item.attempts += 1;
      item.lastError = String((error as Error).message ?? error).slice(0, 500);
      if (item.attempts >= world.queue.settings.maxAttempts) item.status = "failed";
      try {
        await commitFiles({
          message: `blog(autogen): record ${item.slug} failure [vercel skip]`,
          changes: [{ path: QUEUE_PATH, contentText: serializeQueue(world.queue) }],
        });
      } catch {
        // Best effort; the attempt count just won't persist.
      }
      return NextResponse.json(
        { ok: false, error: item.lastError, attempts: item.attempts, status: item.status },
        { status: 502 },
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: `Generation failed: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
