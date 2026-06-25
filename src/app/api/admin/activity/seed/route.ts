/**
 * POST /api/admin/activity/seed
 * Body:
 *   { action: "toggle", enabled: boolean }  -> turn launch-period demo activity on/off
 *   { action: "purge" }                      -> delete every seeded event
 *
 * Controls the seeded social-proof activity (the cron at
 * /api/cron/seed-activity). Gated on activity.manage, same as the rest of the
 * recent-activity admin surface.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  writeSeedEnabled,
  deleteSeededActivity,
  writeSeedQueue,
} from "@/lib/recent-activity";
import { topUpSeedQueue, SEED_QUEUE_TARGET } from "@/lib/seed-locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeedBody = { action?: unknown; enabled?: unknown };

export async function POST(request: Request) {
  const actor = await requirePermission("activity.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: SeedBody;
  try {
    body = (await request.json()) as SeedBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.action === "toggle") {
    const enabled = body.enabled === true;
    const ok = await writeSeedEnabled(enabled, actor.email);
    if (!ok) return NextResponse.json({ error: "Could not save" }, { status: 500 });
    // Populate the upcoming queue right away when turning on (so the admin sees
    // it immediately, without waiting for the cron); clear it when turning off.
    await writeSeedQueue(enabled ? topUpSeedQueue([], Date.now(), SEED_QUEUE_TARGET) : []);
    await logAdminAction({
      actor,
      action: "activity.manage",
      targetType: "config",
      targetId: "activity_seed",
      details: { enabled },
    });
    return NextResponse.json({ ok: true, seedEnabled: enabled });
  }

  if (body.action === "purge") {
    const ok = await deleteSeededActivity();
    await writeSeedQueue([]);
    if (!ok) return NextResponse.json({ error: "Could not purge" }, { status: 500 });
    await logAdminAction({
      actor,
      action: "activity.manage",
      targetType: "event",
      targetId: "seeded",
      details: { purged: true },
    });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
