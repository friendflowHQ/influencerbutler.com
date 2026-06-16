import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ListClient = {
  from: (table: string) => {
    select: (cols: string) => {
      order: (
        col: string,
        opts: { ascending: boolean },
      ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
  };
};

function envSuperAdmins(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Lists assistant accounts (staff_members rows) plus the env-based super-admins
 * (read-only). Super-admin only via the staff.manage permission.
 */
export async function GET(request: Request) {
  const actor = await requirePermission("staff.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as ListClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("staff_members")
    .select("id,user_id,email,role,permissions,is_active,label,invited_at,created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("admin/staff/list query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  return NextResponse.json({
    admin: { email: actor.email },
    assistants: data ?? [],
    superAdmins: envSuperAdmins(),
  });
}
