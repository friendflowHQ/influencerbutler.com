import { NextResponse } from "next/server";
import { getAdminSession, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PendingQuestion = {
  id: string;
  workspace_id: string;
  title: string;
  body: string | null;
  author_id: string | null;
  author_email: string | null;
  created_at: string;
  status: string;
};

type AdminListClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        order: (
          col: string,
          options: { ascending: boolean },
        ) => Promise<{ data: PendingQuestion[] | null; error: unknown }>;
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
    const { data: pending, error } = await supabase
      .from("community_questions")
      .select(
        "id,workspace_id,title,body,author_id,author_email,created_at,status",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("admin community list query failed", error);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }

    return NextResponse.json({
      admin: { email: admin.email },
      pending: pending ?? [],
    });
  } catch (error) {
    console.error("admin community list failed", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
