/**
 * Weekly valuation snapshot.
 *
 * Recomputes the business's estimated valuation (ARR x revenue-multiple
 * range, see src/lib/valuation.ts) and stores it in valuation_snapshots for
 * the Finance dashboard's Valuation tab. Unlike every other /api/cron/* route
 * in this folder, this one is deliberately NOT registered in vercel.json: the
 * weekly trigger is a Claude Code scheduled routine calling this endpoint
 * every Monday, not Vercel's own cron scheduler. Guarded by CRON_SECRET the
 * same way every other cron route is.
 *
 * ?asOf=YYYY-MM-DD overrides "today" (default: now). ?backfillWeeks=N (default
 * 1) also computes the N-1 Mondays before that, for seeding history in one
 * call. ?preview=1 computes and returns the numbers without writing, for
 * testing.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeValuationSnapshot, upsertValuationSnapshot } from "@/lib/valuation";
import { isMigrationPendingError } from "@/lib/finance-stepup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron valuation: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";
  const asOfParam = url.searchParams.get("asOf");
  const asOf = asOfParam ? new Date(`${asOfParam}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(asOf.getTime())) {
    return NextResponse.json({ error: "Invalid asOf date" }, { status: 400 });
  }
  const backfillWeeks = Math.max(1, Math.min(52, Number(url.searchParams.get("backfillWeeks")) || 1));

  const supabase = createAdminClient();

  const results: Array<Record<string, unknown>> = [];
  for (let i = 0; i < backfillWeeks; i++) {
    const weekAsOf = new Date(asOf.getTime() - i * WEEK_MS);
    const snapshot = await computeValuationSnapshot(supabase, weekAsOf);
    if (!snapshot) {
      results.push({ asOf: weekAsOf.toISOString(), ok: false, error: "compute failed" });
      continue;
    }
    if (preview) {
      results.push({ ok: true, snapshot });
      continue;
    }
    const written = await upsertValuationSnapshot(supabase, snapshot);
    if (!written.ok && isMigrationPendingError({ code: written.errorCode })) {
      // valuation_snapshots not applied to prod yet.
      return NextResponse.json({ migrationPending: true });
    }
    results.push({ ok: written.ok, snapshotDate: snapshot.snapshotDate, error: written.error });
  }

  return NextResponse.json({ ok: true, preview, results });
}
