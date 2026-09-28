/**
 * POST /api/admin/growth/social-snapshot
 *
 * Records one day's community member headcount for a platform (currently the
 * Facebook group). A daily scheduled task reads the count from the group page
 * and posts it here; the Growth dashboard's "Facebook group members" tile and
 * the founder snapshot email both read it back through computeGrowthSnapshot().
 *
 * Upserts on (platform, captured_on) so re-running a day corrects that day's
 * number instead of adding a duplicate.
 *
 * Auth: either
 *   1. an admin session cookie / admin license bearer (the logged-in dashboard
 *      or desktop app), via getAdminSessionAny; or
 *   2. the X-Cron-Secret header matching CRON_SECRET (an unattended job).
 *
 * Body:
 *   {
 *     platform?: string,     // defaults to "facebook"
 *     memberCount: number,   // non-negative integer
 *     capturedOn?: string    // 'YYYY-MM-DD' (UTC); defaults to today
 *   }
 *
 * GET returns the most recent snapshot per platform, for quick verification.
 */
import { NextResponse } from "next/server";
import { getAdminSessionAny, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  platform?: unknown;
  memberCount?: unknown;
  capturedOn?: unknown;
};

type UpsertClient = {
  from: (table: string) => {
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
    select: (cols: string) => {
      order: (
        col: string,
        options: { ascending: boolean },
      ) => { limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }> };
    };
  };
};

/** 'YYYY-MM-DD' (UTC) for a date. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function hasCronSecret(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("x-cron-secret") ?? "";
  return header === secret;
}

async function isAuthorized(request: Request): Promise<boolean> {
  if (hasCronSecret(request)) return true;
  const session = await getAdminSessionAny(request);
  return session !== null;
}

export async function POST(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Body is not valid JSON" }, { status: 400 });
  }

  const platform =
    typeof body.platform === "string" && body.platform.trim() !== ""
      ? body.platform.trim().toLowerCase()
      : "facebook";

  const memberCount = Number(body.memberCount);
  if (!Number.isFinite(memberCount) || !Number.isInteger(memberCount) || memberCount < 0) {
    return NextResponse.json(
      { error: "memberCount must be a non-negative integer" },
      { status: 400 },
    );
  }

  let capturedOn = typeof body.capturedOn === "string" ? body.capturedOn.trim() : todayUtc();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(capturedOn)) {
    return NextResponse.json(
      { error: "capturedOn must be a 'YYYY-MM-DD' date" },
      { status: 400 },
    );
  }

  const supabase = createAdminClient() as unknown as UpsertClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase.from("social_snapshots").upsert(
    {
      platform,
      captured_on: capturedOn,
      member_count: memberCount,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "platform,captured_on" },
  );

  if (error) {
    console.error("social-snapshot upsert failed", error);
    return NextResponse.json({ error: "Upsert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, platform, capturedOn, memberCount });
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient() as unknown as UpsertClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("social_snapshots")
    .select("platform,captured_on,member_count")
    .order("captured_on", { ascending: false })
    .limit(30);

  if (error) {
    console.error("social-snapshot read failed", error);
    return NextResponse.json({ error: "Read failed" }, { status: 500 });
  }

  return NextResponse.json({ recent: data ?? [] });
}
