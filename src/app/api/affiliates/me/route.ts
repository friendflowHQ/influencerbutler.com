import { NextResponse } from "next/server";
import { fetchLsAffiliate, fetchLsAffiliateReferrals } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type StatsRequestBody = {
  lsAffiliateId?: string;
};

// POST: fetches Lemon Squeezy affiliate stats.
// Auth is enforced by middleware via cookie check. Supabase profile/application
// data is fetched client-side to avoid Vercel -> Supabase DNS failures.
export async function POST(request: Request) {
  try {
    const { lsAffiliateId } = (await request.json()) as StatsRequestBody;

    if (!lsAffiliateId) {
      return NextResponse.json({ error: "Missing lsAffiliateId" }, { status: 400 });
    }

    const [summary, referrals] = await Promise.all([
      fetchLsAffiliate(lsAffiliateId),
      fetchLsAffiliateReferrals(lsAffiliateId),
    ]);

    if (!summary) {
      return NextResponse.json(
        { state: "error", message: "Could not load affiliate data" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      state: summary.status === "active" ? "active" : "disabled",
      affiliate: summary,
      referrals,
      lsAffiliateId,
    });
  } catch (error) {
    console.error("api/affiliates/me error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
