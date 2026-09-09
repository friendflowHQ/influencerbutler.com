import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate control for the public /leaderboard board.
 *
 * GET  -> { optIn: boolean } current state for the calling affiliate.
 * POST -> body { optIn: boolean } sets profiles.public_leaderboard_opt_in.
 *
 * Writes go through the service-role client (after the is_affiliate gate)
 * because the column is intentionally outside the anon/authenticated UPDATE
 * grant (see 20260827_profiles_column_lockdown.sql). When true, the affiliate
 * is shown on the public board by their handle; when false, masked initials.
 */

async function authedAffiliate() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const admin = createAdminClient();
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("is_affiliate")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileErr) {
    return { error: NextResponse.json({ error: "Could not load affiliate" }, { status: 500 }) };
  }
  if (!profile || profile.is_affiliate !== true) {
    return { error: NextResponse.json({ error: "Not an affiliate" }, { status: 403 }) };
  }
  return { admin, userId: userData.user.id };
}

export async function GET() {
  try {
    const ctx = await authedAffiliate();
    if ("error" in ctx) return ctx.error;

    const { data, error } = await ctx.admin
      .from("profiles")
      .select("public_leaderboard_opt_in")
      .eq("id", ctx.userId)
      .maybeSingle();
    if (error) {
      // Column not applied in prod yet: treat as not opted in rather than 500.
      console.warn("leaderboard-optin GET: column read failed", error);
      return NextResponse.json({ optIn: false, migrationPending: true });
    }
    return NextResponse.json({ optIn: data?.public_leaderboard_opt_in === true });
  } catch (err) {
    console.error("leaderboard-optin GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await authedAffiliate();
    if ("error" in ctx) return ctx.error;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const optIn = (body as { optIn?: unknown } | null)?.optIn;
    if (typeof optIn !== "boolean") {
      return NextResponse.json({ error: "Body must include boolean 'optIn'" }, { status: 400 });
    }

    const { error } = await ctx.admin
      .from("profiles")
      .update({ public_leaderboard_opt_in: optIn })
      .eq("id", ctx.userId);
    if (error) {
      console.error("leaderboard-optin POST: update failed", error);
      return NextResponse.json(
        { error: "Could not save. The leaderboard opt-in may not be enabled yet." },
        { status: 500 },
      );
    }
    return NextResponse.json({ optIn });
  } catch (err) {
    console.error("leaderboard-optin POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
