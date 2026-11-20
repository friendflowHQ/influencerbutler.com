/**
 * GET /api/admin/support/health
 * Read-only snapshot of the AI support pipeline for the dashboard banner:
 * sweep mode (shadow vs live) and its caps, when the bot last touched a
 * ticket, how many auto-answers went out in the last 24h, and the oldest
 * ticket waiting on a human. Gated by support.view.
 *
 * "Bot last active" is the newest lastTriagedAt among the 100 most recent
 * tickets. The Worker does not expose run history, so this is a proxy for
 * "has the autopilot / sweep touched anything lately".
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { callSupportWorker } from "@/lib/support-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InboxTicket = {
  id: string;
  status: string;
  tags?: string;
  lastTriagedAt?: number | null;
  repliedAt?: number | null;
  submittedAt?: number | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  const actor = await requirePermission("support.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [recent, needsMe] = await Promise.all([
    callSupportWorker<{ tickets: InboxTicket[] }>("/agent/inbox?limit=100"),
    callSupportWorker<{ tickets: InboxTicket[] }>("/agent/inbox?statuses=escalated,user_replied&limit=100"),
  ]);
  if (!recent.ok) return NextResponse.json({ error: recent.error }, { status: recent.status });

  const now = Date.now();
  const tickets = recent.data.tickets ?? [];
  let lastBotAt = 0;
  let autoAnswered24h = 0;
  for (const t of tickets) {
    if (t.lastTriagedAt && t.lastTriagedAt > lastBotAt) lastBotAt = t.lastTriagedAt;
    const tags = (t.tags || "").toLowerCase();
    if (tags.includes("auto-answered") && t.repliedAt && now - t.repliedAt < DAY_MS) autoAnswered24h++;
  }

  let oldestNeedsMeAt: number | null = null;
  let needsMeCount = 0;
  if (needsMe.ok) {
    for (const t of needsMe.data.tickets ?? []) {
      needsMeCount++;
      const at = t.repliedAt || t.submittedAt || null;
      if (at && (oldestNeedsMeAt === null || at < oldestNeedsMeAt)) oldestNeedsMeAt = at;
    }
  }

  // Autopilot cadence: hourly on weekdays, four runs a day (about 6h apart) on
  // weekends, Mountain time. Flag "stale" only past a comfortable multiple.
  let weekend = false;
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: "America/Denver", weekday: "short" }).format(new Date(now));
    weekend = wd === "Sat" || wd === "Sun";
  } catch { /* default weekday */ }
  const staleAfterMs = (weekend ? 8 : 3) * 60 * 60 * 1000;
  const stale = !lastBotAt || now - lastBotAt > staleAfterMs;

  const minConf = parseFloat(process.env.SUPPORT_SWEEP_MIN_CONFIDENCE || "0.75");
  const maxSends = parseInt(process.env.SUPPORT_SWEEP_MAX_SENDS || "10", 10);

  return NextResponse.json({
    sweep: {
      mode: process.env.SUPPORT_SWEEP_ENABLED === "true" ? "live" : "shadow",
      minConfidence: Number.isFinite(minConf) && minConf > 0 && minConf <= 1 ? minConf : 0.75,
      maxSendsPerRun: Number.isFinite(maxSends) && maxSends > 0 ? maxSends : 10,
    },
    engineeringAutopilot: process.env.ENG_AUTOPILOT_ENABLED === "true" ? "live" : "shadow",
    lastBotAt: lastBotAt || null,
    stale,
    expectedCadence: weekend ? "about every 6 hours (weekend)" : "hourly (weekday)",
    autoAnswered24h,
    needsMeCount,
    oldestNeedsMeAt,
    // Worker-side auto-close rules, documented in the support-autopilot routine.
    autoClose: { waitingOnUserDays: 4, noReplyDays: 5 },
  });
}
