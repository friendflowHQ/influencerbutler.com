import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin";
import { approveAffiliate } from "@/lib/affiliates-approve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApproveBody = {
  userId?: string;
};

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
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
    adminEmail: admin.email,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    ok: true,
    lsAffiliateId: result.lsAffiliateId,
    shareLink: result.shareLink,
    emailSent: result.emailSent,
    brandedCode: result.brandedCode,
    brandedShareLink: result.brandedShareLink,
  });
}
