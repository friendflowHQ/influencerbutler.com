/**
 * GET /api/cron/seed-activity
 *
 * Launch-period social proof. Drives a pre-scheduled queue of upcoming demo
 * events (a planned time + location each), so the admin can see what is coming.
 * Each run: tops the queue up to SEED_QUEUE_TARGET future items, then fires the
 * single earliest item whose time has arrived (inserting it into the real
 * activity feed). Spacing is 10-70 min with overnight US hours skipped; the
 * queue refills itself, so the feed never runs dry.
 *
 * Gated on CRON_SECRET, like the other crons. Honors the "Run demo activity"
 * switch (app_config 'activity_seed'); when off, this is a no-op.
 */
import { NextResponse } from "next/server";
import {
  readSeedEnabled,
  readSeedQueue,
  writeSeedQueue,
  insertSeedActivity,
} from "@/lib/recent-activity";
import { topUpSeedQueue, SEED_QUEUE_TARGET } from "@/lib/seed-locations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("seed-activity cron: CRON_SECRET not set - refusing to execute");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if ((request.headers.get("authorization") ?? "") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await readSeedEnabled())) {
    return NextResponse.json({ ok: true, fired: false, reason: "disabled" });
  }

  const now = Date.now();
  let queue = topUpSeedQueue(await readSeedQueue(), now, SEED_QUEUE_TARGET);

  // Fire the earliest item that is due (one per run keeps the feed calm).
  let fired: string | null = null;
  if (queue.length > 0 && new Date(queue[0].at).getTime() <= now) {
    const item = queue[0];
    const ok = await insertSeedActivity(item);
    if (ok) {
      queue = queue.slice(1);
      fired = `${item.city}${item.region ? ", " + item.region : ""}, ${item.country}`;
    }
  }

  await writeSeedQueue(queue);

  return NextResponse.json({
    ok: true,
    fired: Boolean(fired),
    location: fired,
    upcoming: queue.filter((it) => new Date(it.at).getTime() > now).length,
  });
}
