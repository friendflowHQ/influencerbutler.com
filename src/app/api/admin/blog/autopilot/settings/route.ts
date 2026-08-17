/**
 * PATCH /api/admin/blog/autopilot/settings - update autopilot tunables
 * (leadDays, maxPerRun, maxPerDay, maxAttempts, notify). Stored in the queue
 * file so they're versioned and admin-editable without env changes.
 * Permission: blog.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { ConflictError } from "@/lib/github-content";
import { loadQueue } from "@/lib/blog-autogen/queue";
import { commitQueue, envError } from "../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NUMERIC_BOUNDS: Record<string, [number, number]> = {
  leadDays: [0, 14],
  maxPerRun: [1, 5],
  maxPerDay: [1, 5],
  maxAttempts: [1, 10],
};

export async function PATCH(request: Request) {
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
  const expectedHeadSha =
    typeof body.expectedHeadSha === "string" ? body.expectedHeadSha : undefined;

  try {
    const queue = await loadQueue();
    for (const [key, [min, max]] of Object.entries(NUMERIC_BOUNDS)) {
      const value = body[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        (queue.settings as unknown as Record<string, number>)[key] = Math.min(
          max,
          Math.max(min, Math.floor(value)),
        );
      }
    }
    if (typeof body.notify === "boolean") queue.settings.notify = body.notify;

    const commitSha = await commitQueue(queue, "update settings", actor.email ?? "", expectedHeadSha);

    await logAdminAction({
      actor,
      action: "blog.autopilot.settings.update",
      targetType: "blog_autopilot",
      targetId: "settings",
      details: { ...queue.settings, commitSha },
    });

    return NextResponse.json({ settings: queue.settings, commitSha });
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
