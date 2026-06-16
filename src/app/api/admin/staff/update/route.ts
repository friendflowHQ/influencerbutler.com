import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { sanitizePermissions } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type UpdateBody = {
  userId?: string;
  permissions?: unknown;
  is_active?: unknown;
  label?: unknown;
};

type UpdateClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

/** Edit an assistant's permissions, active state, or label. Super-admin only. */
export async function POST(request: Request) {
  const actor = await requirePermission("staff.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: UpdateBody;
  try {
    body = (await request.json()) as UpdateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.permissions !== undefined) payload.permissions = sanitizePermissions(body.permissions);
  if (typeof body.is_active === "boolean") payload.is_active = body.is_active;
  if (typeof body.label === "string") payload.label = body.label.trim() || null;

  const supabase = createAdminClient() as unknown as UpdateClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase.from("staff_members").update(payload).eq("user_id", userId);
  if (error) {
    console.error("admin/staff/update failed", error);
    return NextResponse.json({ error: "Could not update assistant" }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "staff.update",
    targetType: "user",
    targetId: userId,
    details: payload,
  });

  return NextResponse.json({ ok: true });
}
