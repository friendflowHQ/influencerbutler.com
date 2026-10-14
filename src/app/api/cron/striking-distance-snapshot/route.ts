/**
 * Weekly striking-distance snapshot.
 *
 * Once a week, pulls the queries that rank at positions 4 to 20 from Search
 * Console and stores them in app_config ('growth_gsc_striking_weekly'). The
 * Growth dashboard compares its live list against this snapshot to show how
 * each keyword moved since last week and to flag new arrivals.
 *
 * Scheduled weekly (Mondays) in vercel.json. Guarded by CRON_SECRET like the
 * other crons. Returns { skipped: true } until Search Console is configured.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";
import { verifyBearer } from "@/lib/auth-secret";
import { fetchStrikingDistance, isGscConfigured } from "@/lib/gsc";
import { STRIKING_SNAPSHOT_KEY, toSnapshot } from "@/lib/striking-distance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpsertClient = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      opts?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

function isAuthorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

async function run(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isGscConfigured()) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Search Console not configured" });
  }

  const result = await fetchStrikingDistance();
  if (result.rows === null) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  const db = createAdminClient() as unknown as UpsertClient | null;
  if (!db) {
    return NextResponse.json({ ok: false, error: "No database client" }, { status: 500 });
  }

  const snapshot = toSnapshot(result.rows);
  const { error } = await db.from("app_config").upsert(
    {
      key: STRIKING_SNAPSHOT_KEY,
      value: snapshot,
      updated_at: new Date().toISOString(),
      updated_by: "cron:striking-distance",
    },
    { onConflict: "key" },
  );
  if (error) {
    console.error("cron striking-distance-snapshot: write failed", error);
    return NextResponse.json({ ok: false, error: "Snapshot write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: snapshot.rows.length, takenAt: snapshot.takenAt });
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
