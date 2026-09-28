/**
 * GET /api/cron/support-sweep
 *
 * The support auto-responder sweep. A few times a day in business hours (see
 * vercel.json) it pulls the "needs attention" ticket pile from the feedback
 * Worker, drafts grounded replies, auto-sends the safe how-to answers (only when
 * SUPPORT_SWEEP_ENABLED=true), and emails the owner a recap of what it did and
 * what still needs a human. The recap fires on EVERY run, including shadow mode.
 *
 * Query params:
 *   ?dry=1            run the sweep but render the recap instead of emailing it,
 *                     and force shadow mode (no customer emails, no status changes)
 *   ?dry=1&sample=1   render sample data (no worker/LLM) for pure design review
 *
 * Gated on CRON_SECRET like the other crons (the sample preview is exempt).
 */
import { NextResponse } from "next/server";
import { runSupportSweep, sampleSweepReport } from "@/lib/support-sweep";
import {
  renderSupportRecapHtml,
  recapSubject,
  sendSupportRecap,
} from "@/lib/support-recap-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The sweep fetches + drafts per ticket; give it room beyond the default.
export const maxDuration = 300;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("support-sweep cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dry = url.searchParams.get("dry") === "1";
  const sample = url.searchParams.get("sample") === "1";

  // Sample preview needs no secret and no worker/LLM: it is just the design.
  if (dry && sample) {
    return new NextResponse(renderSupportRecapHtml(sampleSweepReport()), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let report;
  try {
    // dry=1 forces dryRun so a manual preview never sends or mutates tickets.
    report = await runSupportSweep({ dryRun: dry });
  } catch (err) {
    console.error("support-sweep cron: run failed", err);
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }

  if (dry) {
    return new NextResponse(renderSupportRecapHtml(report), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const result = await sendSupportRecap(report);
  return NextResponse.json({
    ok: result.ok,
    skipped: result.skipped ?? null,
    mode: report.mode,
    subject: recapSubject(report),
    swept: report.swept,
    autoSent: report.autoSent.length,
    drafts: report.drafts.length,
    needsYou: report.needsYou.length,
    autopilotQueue: report.autopilotQueue.length,
    errors: report.errors,
  });
}
