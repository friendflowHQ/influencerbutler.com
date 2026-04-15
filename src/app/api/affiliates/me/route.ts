import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchLsAffiliate } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SupabaseLike = {
  auth: {
    getSession: () => Promise<{
      data: { session: { user?: { id?: string } } | null };
    }>;
  };
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
      };
    };
  };
};

export async function GET() {
  const supabase = (await createClient()) as unknown as SupabaseLike;

  // Cookie-local auth read to avoid transient Vercel -> Supabase fetch issues.
  let user: { id: string } | null = null;
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) user = { id: session.user.id };
  } catch (error) {
    console.error("api/affiliates/me: auth.getSession threw", error);
  }

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_affiliate,ls_affiliate_id")
    .eq("id", user.id)
    .maybeSingle();

  const lsAffiliateId =
    typeof profile?.ls_affiliate_id === "string" && profile.ls_affiliate_id.length > 0
      ? profile.ls_affiliate_id
      : null;

  const { data: application } = await supabase
    .from("affiliate_applications")
    .select("status,full_name,email,created_at")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!lsAffiliateId) {
    return NextResponse.json({
      state: application ? "pending" : "none",
      application: application ?? null,
    });
  }

  const summary = await fetchLsAffiliate(lsAffiliateId);
  if (!summary) {
    return NextResponse.json({ state: "error", message: "Could not load affiliate data" });
  }

  return NextResponse.json({
    state: summary.status === "active" ? "active" : "disabled",
    affiliate: summary,
    lsAffiliateId,
  });
}
