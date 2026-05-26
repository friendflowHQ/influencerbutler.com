import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatsRequestBody = {
  /** ISO timestamp inclusive. */
  from?: string;
  /** ISO timestamp exclusive. */
  to?: string;
};

type StatsRow = {
  total: number;
  prevTotal: number;
  bySource: { source: string; count: number }[];
  byReferrer: { host: string; count: number }[];
  byCountry: { country: string; count: number }[];
  byDay: { date: string; count: number }[];
};

function parseIso(value: string | undefined, fallback: Date): Date {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return fallback;
  return d;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as StatsRequestBody;
    const now = new Date();
    const defaultFrom = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const from = parseIso(body.from, defaultFrom);
    const to = parseIso(body.to, now);

    if (from >= to) {
      return NextResponse.json({ error: "Invalid window: from >= to" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data, error } = await supabase.rpc("affiliate_clicks_stats", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    });

    if (error) {
      console.error("affiliate_clicks_stats RPC failed", error);
      return NextResponse.json({ error: "Stats unavailable" }, { status: 500 });
    }

    const stats = (data ?? {
      total: 0,
      prevTotal: 0,
      bySource: [],
      byReferrer: [],
      byCountry: [],
      byDay: [],
    }) as StatsRow;

    return NextResponse.json(stats);
  } catch (err) {
    console.error("api/affiliates/clicks error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
