/**
 * GET /api/admin/blog/autopilot - the autopilot dashboard payload: campaigns,
 * queue items (with a derived "due" display flag), settings, and the branch
 * head sha the UI echoes back on mutations for conflict detection.
 * Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getHead } from "@/lib/github-content";
import { loadQueue } from "@/lib/blog-autogen/queue";
import { envError } from "./shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("blog.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const env = envError();
  if (env) return env;

  try {
    const [queue, head] = await Promise.all([loadQueue(), getHead()]);
    const today = new Date().toISOString().slice(0, 10);
    return NextResponse.json({
      campaigns: queue.campaigns,
      items: queue.items.map((item) => ({
        ...item,
        due: item.status === "queued" && item.generateOn <= today,
      })),
      settings: queue.settings,
      headSha: head.commitSha,
      today,
      writerModel: process.env.BLOG_WRITER_MODEL || "gpt-4o",
      disabled: Boolean(process.env.BLOG_AUTOGEN_DISABLED),
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to load queue: ${(error as Error).message}` },
      { status: 502 },
    );
  }
}
