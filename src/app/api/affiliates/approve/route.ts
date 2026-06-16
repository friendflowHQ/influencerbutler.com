import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { approveAffiliate } from "@/lib/affiliates-approve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApproveBody = {
  userId?: string;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.approve", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ApproveBody;
  try {
    body = (await request.json()) as ApproveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const result = await approveAffiliate({
    userId,
    actor: "admin",
    adminEmail: actor.email,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await logAdminAction({
    actor,
    action: "affiliate.approve",
    targetType: "user",
    targetId: userId,
    details: { brandedCode: result.brandedCode, lsAffiliateId: result.lsAffiliateId },
  });

  return NextResponse.json({
    ok: true,
    lsAffiliateId: result.lsAffiliateId,
    emailSent: result.emailSent,
    brandedCode: result.brandedCode,
    brandedShareLink: result.brandedShareLink,
  });
}
