import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin "view as affiliate" click analytics. Returns the SAME StatsRow shape as
 * POST /api/affiliates/clicks, but for an arbitrary affiliate (?userId=), gated
 * behind affiliates.view.
 *
 * The self endpoint uses the affiliate_clicks_stats RPC, which resolves the code
 * from auth.uid() and so cannot target another affiliate. Rather than add a new
 * RPC (a hand-applied migration), we aggregate affiliate_clicks directly via the
 * service-role client, mirroring the SQL in supabase/migrations/20260528. Click
 * volumes are per-affiliate and small; we cap the scan generously and would move
 * to a dedicated admin RPC if that ever stops holding.
 */

const ROW_CAP = 20000;

type StatsRow = {
  total: number;
  prevTotal: number;
  bySource: { source: string; count: number }[];
  byReferrer: { host: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDay: { date: string; count: number }[];
};

type ClickRow = {
  source: string | null;
  referrer_host: string | null;
  ip_country: string | null;
  created_at: string | null;
};

const EMPTY: StatsRow = { total: 0, prevTotal: 0, bySource: [], byReferrer: [], byCountry: [], byDay: [] };

function parseIso(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? fallback : d;
}

/** Sorted [{key,count}] desc, optionally truncated. */
function countBy(rows: ClickRow[], pick: (r: ClickRow) => string | null, limit?: number) {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const key = pick(r);
    if (key === null || key === "") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const sliced = typeof limit === "number" ? sorted.slice(0, limit) : sorted;
  return sliced;
}

export async function POST(request: Request) {
  try {
    const actor = await requirePermission("affiliates.view", request);
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as { from?: string; to?: string };
    const now = new Date();
    const from = parseIso(body.from, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
    const to = parseIso(body.to, now);
    if (from >= to) {
      return NextResponse.json({ error: "Invalid window: from >= to" }, { status: 400 });
    }
    // Previous same-length window, for the trend comparison.
    const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

    const admin = createAdminClient();

    const { data: profile } = await admin
      .from("profiles")
      .select("affiliate_code")
      .eq("id", userId)
      .maybeSingle();
    const code = typeof profile?.affiliate_code === "string" ? profile.affiliate_code : null;
    if (!code) {
      // Affiliate without a branded code yet: empty shape, like the RPC.
      return NextResponse.json(EMPTY);
    }

    // Case-insensitive code match (codes are sanitized [A-Z0-9], so no ilike
    // wildcards leak). Pull the previous+current window in one scan.
    const { data: rows, error } = await admin
      .from("affiliate_clicks")
      .select("source,referrer_host,ip_country,created_at")
      .ilike("affiliate_code", code)
      .eq("is_bot", false)
      .gte("created_at", prevFrom.toISOString())
      .lt("created_at", to.toISOString())
      .limit(ROW_CAP);

    if (error) {
      console.error("admin-affiliate-clicks: query failed", error);
      return NextResponse.json({ error: "Stats unavailable" }, { status: 500 });
    }

    const all = (rows ?? []) as ClickRow[];
    if (all.length >= ROW_CAP) {
      console.warn(`admin-affiliate-clicks: hit ${ROW_CAP}-row cap for code ${code}; counts may undercount`);
    }

    const fromMs = from.getTime();
    const cur: ClickRow[] = [];
    let prevTotal = 0;
    for (const r of all) {
      const t = r.created_at ? new Date(r.created_at).getTime() : NaN;
      if (Number.isNaN(t)) continue;
      if (t >= fromMs) cur.push(r);
      else prevTotal += 1;
    }

    const stats: StatsRow = {
      total: cur.length,
      prevTotal,
      bySource: countBy(cur, (r) => r.source ?? "other").map(([source, count]) => ({ source, count })),
      byReferrer: countBy(cur, (r) => r.referrer_host, 10).map(([host, count]) => ({ host, count })),
      byCountry: countBy(cur, (r) => r.ip_country, 10).map(([country, count]) => ({ country, count })),
      byDay: countBy(cur, (r) => (r.created_at ? r.created_at.slice(0, 10) : null))
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    };

    return NextResponse.json(stats);
  } catch (err) {
    console.error("admin-affiliate-clicks error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
