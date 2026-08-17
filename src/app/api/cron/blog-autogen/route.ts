/**
 * GET /api/cron/blog-autogen - the blog content autopilot's daily run.
 *
 * Loads the queue (content/blog/_queue.json) from GitHub, generates due items
 * (generateOn <= today, attempts < maxAttempts) up to settings.maxPerRun, and
 * commits each post atomically (manifest + MDX + hero PNG + queue update in
 * one commit). Scheduled posts then self-publish on their date via the
 * existing ISR date-gate; no further machinery. Failures increment attempts
 * and retry on later runs; a summary email goes to ADMIN_EMAILS.
 *
 * Query: ?dry=1 previews the due selection without generating or committing.
 * Env: CRON_SECRET (auth), OPENAI_API_KEY, GITHUB_CONTENT_*,
 *      BLOG_AUTOGEN_DISABLED=1 kill switch, BLOG_WRITER_MODEL.
 */
import { NextResponse } from "next/server";
import { loadManifestFromGitHub } from "@/app/api/admin/blog/shared";
import { getHead, githubContentConfigured, commitFiles } from "@/lib/github-content";
import { generateOne } from "@/lib/blog-autogen/generate";
import { sendAutogenSummary } from "@/lib/blog-autogen/notify";
import {
  QUEUE_PATH,
  autoCompleteCampaigns,
  loadQueue,
  serializeQueue,
} from "@/lib/blog-autogen/queue";
import type { GenerationResult } from "@/lib/blog-autogen/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Text (~30-60s) + hero image (~30-90s) per post; maxPerRun caps the run and
// the 210s soft deadline below leaves margin for the final commit + email.
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("blog-autogen cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.BLOG_AUTOGEN_DISABLED) {
    return NextResponse.json({ ok: true, skipped: "BLOG_AUTOGEN_DISABLED" });
  }
  if (!githubContentConfigured()) {
    return NextResponse.json({ ok: false, error: "GITHUB_CONTENT_* not configured" });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ ok: false, error: "OPENAI_API_KEY not configured" });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const startedAt = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  let queue, manifest, head;
  try {
    [queue, manifest, head] = await Promise.all([
      loadQueue(),
      loadManifestFromGitHub(),
      getHead(),
    ]);
  } catch (error) {
    const message = `Failed to load queue/manifest: ${(error as Error).message}`;
    console.error(`blog-autogen: ${message}`);
    await sendAutogenSummary([]);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const due = queue.items
    .filter(
      (item) =>
        item.status === "queued" &&
        item.generateOn <= today &&
        item.attempts < queue.settings.maxAttempts,
    )
    .sort((a, b) => a.publishDate.localeCompare(b.publishDate))
    .slice(0, queue.settings.maxPerRun);

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      today,
      due: due.map((i) => ({ id: i.id, slug: i.slug, publishDate: i.publishDate })),
      queuedTotal: queue.items.filter((i) => i.status === "queued").length,
    });
  }

  const world = { manifest, queue, headSha: head.commitSha };
  const results: GenerationResult[] = [];
  let queueDirty = false;
  const deadline = startedAt + 210_000;

  for (const item of due) {
    if (Date.now() > deadline) break;
    try {
      const outcome = await generateOne(item, world);
      results.push({
        ok: true,
        item,
        commitSha: outcome.commitSha,
        warnings: outcome.warnings,
      });
    } catch (error) {
      item.attempts += 1;
      item.lastError = String((error as Error).message ?? error).slice(0, 500);
      if (item.attempts >= world.queue.settings.maxAttempts) item.status = "failed";
      queueDirty = true;
      results.push({ ok: false, item, error: item.lastError });
      console.error(`blog-autogen: ${item.slug} failed: ${item.lastError}`);
    }
  }

  if (autoCompleteCampaigns(world.queue)) queueDirty = true;

  if (queueDirty) {
    try {
      await commitFiles({
        message: "blog(autogen): record run outcomes [vercel skip]",
        changes: [{ path: QUEUE_PATH, contentText: serializeQueue(world.queue) }],
      });
    } catch (error) {
      console.error(`blog-autogen: failed to record outcomes: ${(error as Error).message}`);
    }
  }

  if (results.length && world.queue.settings.notify) {
    await sendAutogenSummary(results);
  }

  return NextResponse.json({
    ok: true,
    today,
    generated: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    remaining: due.length - results.length,
    tookMs: Date.now() - startedAt,
  });
}
