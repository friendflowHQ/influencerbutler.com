import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Super-admin verifies or rejects an affiliate's tax form. Verification is a
 * precondition for being paid out (see the disburse route). Rejecting records a
 * reason and drops the affiliate back to fix-and-resubmit.
 */

type Body = {
  userId?: string;
  action?: "verify" | "reject";
  reason?: string | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.tax.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (body.action !== "verify" && body.action !== "reject") {
    return NextResponse.json({ error: "action must be 'verify' or 'reject'" }, { status: 400 });
  }

  const admin = createAdminClient();
  const nowIso = new Date().toISOString();

  const update =
    body.action === "verify"
      ? {
          status: "verified",
          verified_at: nowIso,
          verified_by: actor.email,
          rejected_reason: null,
          updated_at: nowIso,
        }
      : {
          status: "rejected",
          verified_at: null,
          verified_by: actor.email,
          rejected_reason:
            typeof body.reason === "string" && body.reason.trim().length > 0
              ? body.reason.trim()
              : "Please review and resubmit.",
          updated_at: nowIso,
        };

  const { error } = await admin
    .from("affiliate_tax_forms")
    .update(update)
    .eq("user_id", userId);

  if (error) {
    console.error("admin-tax-verify: update failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "affiliate.tax.review",
    targetType: "user",
    targetId: userId,
    details: { action: body.action },
  });

  return NextResponse.json({ ok: true, status: update.status });
}
