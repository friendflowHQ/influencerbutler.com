/**
 * GET  /api/admin/activity/config  -> current widget config + recent events (incl hidden)
 * POST /api/admin/activity/config  -> update { enabled, windowMinutes, maxCount }
 *
 * Powers the admin recent-activity curation page. Gated on activity.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  readActivityConfig,
  writeActivityConfig,
  listAdminActivity,
  readSeedEnabled,
  type ActivityConfig,
} from "@/lib/recent-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("activity.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [config, events, seedEnabled] = await Promise.all([
    readActivityConfig(),
    listAdminActivity(50),
    readSeedEnabled(),
  ]);
  return NextResponse.json({ admin: { email: actor.email }, config, events, seedEnabled });
}

type ConfigBody = { enabled?: unknown; windowMinutes?: unknown; maxCount?: unknown };

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function POST(request: Request) {
  const actor = await requirePermission("activity.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: ConfigBody;
  try {
    body = (await request.json()) as ConfigBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = await readActivityConfig();
  const next: ActivityConfig = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
    windowMinutes: clampInt(body.windowMinutes, current.windowMinutes, 5, 60 * 24 * 30),
    maxCount: clampInt(body.maxCount, current.maxCount, 1, 20),
  };

  const ok = await writeActivityConfig(next, actor.email);
  if (!ok) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  await logAdminAction({
    actor,
    action: "activity.manage",
    targetType: "config",
    targetId: "activity_widget",
    details: next,
  });

  return NextResponse.json({ ok: true, config: next });
}
