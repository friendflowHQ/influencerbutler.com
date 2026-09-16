/**
 * GET /api/cron/engineering-queue  (a few times daily, CRON_SECRET-guarded)
 * Curates the engineering-autopilot queue: pulls every open bug + feature ticket
 * from the feedback Worker (calls, desktop, extension, chat), dedupes them into
 * ranked canonical items, tags them so the routine can find them, and emails a
 * recap only when there are new items or errors.
 *
 * ?dry=1 previews the computed report and skips all mutations (no tagging, no
 * email). Ships dark: tagging happens only when ENG_AUTOPILOT_ENABLED === "true".
 */
import { NextResponse } from "next/server";
import { runEngineeringQueueSweep, isEngQueueConfigured } from "@/lib/engineering-queue";
import { sendEngRecap } from "@/lib/engineering-queue-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) { console.error("[engineering-queue] CRON_SECRET not set"); return false; }
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isEngQueueConfigured()) {
    return NextResponse.json({ error: "SUPPORT_BOT_TOKEN not configured" }, { status: 500 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const report = await runEngineeringQueueSweep({ dryRun: dry });

  // Preview mode: return the report, send no email.
  if (dry) return NextResponse.json({ ok: true, dry: true, report });

  const recap = await sendEngRecap(report);
  return NextResponse.json({
    ok: true,
    mode: report.mode,
    pulled: report.pulled,
    queued: report.queued.length,
    newItems: report.queued.filter((i) => i.isNew).length,
    recap,
    errors: report.errors,
  });
}
