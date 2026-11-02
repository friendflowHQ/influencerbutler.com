/**
 * GET /api/cron/purge-marketing-email-sends  (daily, CRON_SECRET-guarded, ?dry=1 to preview)
 * Privacy policy section 7: marketing email events (opens/clicks) are kept 24
 * months, then deleted. Removes email_sends rows with funnel 'campaign' or
 * 'sequence' created more than 24 months ago, up to one batch per run (see
 * src/lib/data-retention.ts). Transactional sends and the suppression list are
 * untouched.
 */
import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/scheduling-server";
import { verifyBearer } from "@/lib/auth-secret";
import { purgeMarketingEmailSends } from "@/lib/data-retention";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  const summary = await purgeMarketingEmailSends(admin, { dry });
  console.log("[purge-marketing-email-sends]", JSON.stringify(summary));
  return NextResponse.json({ ok: summary.errors === 0, ...summary });
}
