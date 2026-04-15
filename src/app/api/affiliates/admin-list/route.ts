import { NextResponse } from "next/server";
import { getAdminSession, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AdminListClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        order: (
          col: string,
          options: { ascending: boolean },
        ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
      };
    };
  };
};

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as AdminListClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  try {
    const { data: pending, error: pendingError } = await supabase
      .from("affiliate_applications")
      .select(
        "id,user_id,full_name,email,website,social_handles,audience_size,niche,promotion_strategy,created_at,status",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (pendingError) {
      console.error("admin-list pending query failed", pendingError);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({
      admin: { email: admin.email },
      pending: pending ?? [],
    });
  } catch (error) {
    console.error("admin-list failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
