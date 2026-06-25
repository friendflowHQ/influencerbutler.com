/**
 * GET /api/cron/seed-activity
 *
 * Launch-period social proof. While the site has little or no real activity,
 * this trickles soft "someone is checking out Influencer Butler" events into the
 * recent-activity feed so the homepage widget is not empty. Seeded rows are
 * tagged source = 'seed' (see src/lib/recent-activity.ts) so they are easy to
 * tell apart and remove once real trial clicks and purchases arrive.
 *
 * Cadence: Vercel calls this every 10 minutes (see vercel.json). Each run we
 * roll a random gap in [10, 70] minutes and only insert if at least that long
 * has passed since the last seeded event, which yields organic-looking spacing
 * without a fixed rhythm. We also skip the overnight US hours so the feed does
 * not show a steady stream of activity at 4am.
 *
 * Gated on CRON_SECRET, exactly like /api/cron/affiliate-funnel. Honors the
 * "Demo activity" on/off switch in the admin activity page (app_config
 * 'activity_seed'); when off, this is a no-op.
 */
import { NextResponse } from "next/server";
import {
  readSeedEnabled,
  getLatestSeedActivityAt,
  insertSeedActivity,
} from "@/lib/recent-activity";
import { randomSeedLocation } from "@/lib/seed-locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_GAP_MINUTES = 10;
const MAX_GAP_MINUTES = 70;

// Skip the overnight US window. Hours are UTC; 08:00-12:59 UTC is roughly
// 1am-7am Eastern / 10pm-4am Pacific, when almost nobody would be browsing.
const QUIET_UTC_HOURS_START = 8;
const QUIET_UTC_HOURS_END = 13; // exclusive

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("seed-activity cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const enabled = await readSeedEnabled();
  if (!enabled) {
    return NextResponse.json({ ok: true, inserted: false, reason: "disabled" });
  }

  const utcHour = new Date().getUTCHours();
  if (utcHour >= QUIET_UTC_HOURS_START && utcHour < QUIET_UTC_HOURS_END) {
    return NextResponse.json({ ok: true, inserted: false, reason: "quiet-hours" });
  }

  const lastIso = await getLatestSeedActivityAt();
  const gapMinutes =
    MIN_GAP_MINUTES + Math.floor(Math.random() * (MAX_GAP_MINUTES - MIN_GAP_MINUTES + 1));

  if (lastIso) {
    const minutesSince = (Date.now() - new Date(lastIso).getTime()) / 60_000;
    if (Number.isFinite(minutesSince) && minutesSince < gapMinutes) {
      return NextResponse.json({
        ok: true,
        inserted: false,
        reason: "too-soon",
        minutesSince: Math.round(minutesSince),
        gapMinutes,
      });
    }
  }

  const loc = randomSeedLocation();
  const ok = await insertSeedActivity(loc);

  return NextResponse.json({
    ok,
    inserted: ok,
    location: ok ? `${loc.city}${loc.region ? ", " + loc.region : ""}, ${loc.country}` : null,
    gapMinutes,
  });
}
