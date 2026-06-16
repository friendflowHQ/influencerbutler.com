import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RejectBody = {
  userId?: string;
  reason?: string;
};

type RejectClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.reject", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: RejectBody;
  try {
    body = (await request.json()) as RejectBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const reason = body.reason?.trim() || null;

  const supabase = createAdminClient() as unknown as RejectClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase
    .from("affiliate_applications")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      admin_notes: reason
        ? `Rejected by ${actor.email}: ${reason}`
        : `Rejected by ${actor.email}`,
    })
    .eq("user_id", userId);

  if (error) {
    console.error("reject: update failed", error);
    return NextResponse.json({ error: "Could not update application" }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "affiliate.reject",
    targetType: "user",
    targetId: userId,
    details: reason ? { reason } : null,
  });

  return NextResponse.json({ ok: true });
}
