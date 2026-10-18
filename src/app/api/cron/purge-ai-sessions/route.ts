/**
 * GET /api/cron/purge-ai-sessions  (daily, CRON_SECRET-guarded, ?dry=1 to preview)
 * Privacy policy section 7: AI Assistant transcripts are kept 12 months, then
 * deleted. Removes ai_concierge_sessions rows created more than 12 months ago,
 * up to one batch per run (see src/lib/data-retention.ts).
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { verifyBearer } from "@/lib/auth-secret";
import { purgeAiSessions } from "@/lib/data-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const summary = await purgeAiSessions(admin, { dry });
  console.log("[purge-ai-sessions]", JSON.stringify(summary));
  return NextResponse.json({ ok: summary.errors === 0, ...summary });
}
