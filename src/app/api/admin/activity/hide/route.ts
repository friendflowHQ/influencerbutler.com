/**
 * POST /api/admin/activity/hide
 * Body: { id: number, hidden?: boolean }  (hidden defaults to true)
 *
 * Hides or unhides a single recent-activity event from the public widget feed.
 * Gated on activity.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { setActivityHidden } from "@/lib/recent-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HideBody = { id?: unknown; hidden?: unknown };

export async function POST(request: Request) {
  const actor = await requirePermission("activity.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: HideBody;
  try {
    body = (await request.json()) as HideBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Bad id" }, { status: 400 });
  }
  const hidden = body.hidden !== false; // default to hiding

  const ok = await setActivityHidden(id, hidden);
  if (!ok) return NextResponse.json({ error: "Could not update" }, { status: 500 });

  await logAdminAction({
    actor,
    action: "activity.manage",
    targetType: "event",
    targetId: String(id),
    details: { hidden },
  });

  return NextResponse.json({ ok: true });
}
