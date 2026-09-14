/**
 * GET /api/admin/recall-health
 * Owner diagnostic for the call-recording pipeline. Reports whether Recall.ai is
 * configured, does a harmless live probe (GET /bot/) to validate the API key and
 * region, and summarizes recent Google Meet bookings' recording_status so a
 * systemic failure (bots never scheduling) is visible at a glance. Gated by
 * scheduling.view; safe to open in a browser while signed in as an admin.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { getAdmin } from "@/lib/scheduling-server";
import { recallHealthCheck, probeBotCreate } from "@/lib/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("scheduling.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const health = await recallHealthCheck();

  // ?deep=1 additionally attempts a real bot create (with a dummy Meet URL, then
  // cleans it up) to surface the exact reason scheduleBot fails. It writes, so it
  // is opt-in, not part of the default read-only check.
  const deep = new URL(request.url).searchParams.get("deep") === "1";
  const botCreate = deep ? await probeBotCreate() : null;

  // Recent recording outcomes for calls that had a real Meet room, so a
  // 100%-failing pipeline is obvious right here next to the config diagnosis.
  const recentRecordings: { status: string; count: number }[] = [];
  const admin = getAdmin();
  if (admin) {
    const { data } = await admin
      .from("call_bookings")
      .select("recording_status")
      .eq("meeting_provider", "google_meet")
      .order("starts_at", { ascending: false })
      .limit(50);
    const counts: Record<string, number> = {};
    for (const r of (data ?? []) as { recording_status: string | null }[]) {
      const k = r.recording_status || "none";
      counts[k] = (counts[k] || 0) + 1;
    }
    for (const [status, count] of Object.entries(counts)) recentRecordings.push({ status, count });
    recentRecordings.sort((a, b) => b.count - a.count);
  }

  return NextResponse.json({ recall: health, botCreate, recentRecordings });
}
