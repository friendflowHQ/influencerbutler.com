/**
 * GET /api/cron/ops-health-heartbeat  (CRON_SECRET-guarded, ?dry=1 to check without
 * emailing, ?force=1 to treat the report as stale and bypass the throttle)
 *
 * Dead-man's switch for the daily ops health routine. That routine runs on the
 * owner's PC through Chrome, so if the PC is off or a dashboard sign-in expired it
 * silently stops, and "no alert" would look like "all clear". This emails the owner
 * when no report has arrived in 36 hours (throttled to once a day).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkOpsHealthHeartbeat } from "@/lib/ops-health-alert";
import { verifyBearer } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const result = await checkOpsHealthHeartbeat({
    admin: createAdminClient(),
    dry: url.searchParams.get("dry") === "1",
    force: url.searchParams.get("force") === "1",
  });
  return NextResponse.json(result);
}
