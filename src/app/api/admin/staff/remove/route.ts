import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RemoveBody = { userId?: string };

type RemoveClient = {
  from: (table: string) => {
    delete: () => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

/**
 * Removes an assistant's staff_members row (revokes all access). The underlying
 * auth user is left intact so they keep any normal customer account. Super-admin
 * only.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("staff.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: RemoveBody;
  try {
    body = (await request.json()) as RemoveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as RemoveClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase.from("staff_members").delete().eq("user_id", userId);
  if (error) {
    console.error("admin/staff/remove failed", error);
    return NextResponse.json({ error: "Could not remove assistant" }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "staff.remove",
    targetType: "user",
    targetId: userId,
  });

  return NextResponse.json({ ok: true });
}
