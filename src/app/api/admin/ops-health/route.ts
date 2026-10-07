/**
 * POST /api/admin/ops-health  (CRON_SECRET bearer, ?dry=1 to render without sending)
 *
 * Receiver for the daily ops health routine (a scheduled Claude task that checks
 * the Cloudflare, Vercel, Resend and Supabase dashboards). Body:
 *   { ranAt, findings: [{service, severity, title, detail, fix}], autoFixed: [{service, action, result}] }
 * Persists the report (so the heartbeat cron can tell the routine went quiet) and
 * emails the owner when something is alarming. See src/lib/ops-health-alert.ts.
 *
 * GET returns the last stored report (same auth) so the routine can compare.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOpsHealthStatus, parseOpsHealthReport, recordOpsHealthReport } from "@/lib/ops-health-alert";
import { verifyBearer } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const status = await getOpsHealthStatus(createAdminClient());
  return NextResponse.json({ status });
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }
  const report = parseOpsHealthReport(body);
  if (!report) {
    return NextResponse.json({ error: "Expected { findings: [...], autoFixed?: [...] }" }, { status: 400 });
  }

  const result = await recordOpsHealthReport(report, { admin: createAdminClient(), dry });

  return NextResponse.json({
    ok: true,
    dry,
    findings: report.findings.length,
    actionable: report.findings.filter((f) => f.severity !== "info").length,
    autoFixed: report.autoFixed.length,
    alerted: result.alerted,
    wouldAlert: result.wouldAlert,
    ...(dry ? { subject: result.subject, text: result.text } : {}),
  });
}
