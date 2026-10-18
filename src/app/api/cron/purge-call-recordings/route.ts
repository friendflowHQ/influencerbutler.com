/**
 * GET /api/cron/purge-call-recordings  (daily, CRON_SECRET-guarded, ?dry=1 to preview)
 * Privacy policy section 7: private call recordings and transcripts are kept 12
 * months, then deleted. Deletes the media at Recall.ai, then clears the recording
 * fields on call_bookings older than 12 months, up to one batch per run (see
 * src/lib/data-retention.ts).
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { verifyBearer } from "@/lib/auth-secret";
import { purgeCallRecordings } from "@/lib/data-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const summary = await purgeCallRecordings(admin, { dry });
  console.log("[purge-call-recordings]", JSON.stringify(summary));
  return NextResponse.json({ ok: summary.errors === 0, ...summary });
}
