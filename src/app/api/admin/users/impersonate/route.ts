import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * HIGH RISK. Generates a one-time magic link that signs the operator in AS the
 * target user, for support debugging. The link is returned to the operator (not
 * emailed to the user) and every use is audited. Gated by users.impersonate.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("users.impersonate", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const { data: linkData, error: linkErr } = await svc.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl.replace(/\/$/, "")}/dashboard` },
  });
  const actionLink = linkData?.properties?.action_link ?? null;
  if (linkErr || !actionLink) {
    console.error("users/impersonate: generateLink failed", linkErr);
    return NextResponse.json({ error: "Could not generate impersonation link." }, { status: 502 });
  }

  await logAdminAction({
    actor,
    action: "users.impersonate",
    targetType: "user",
    targetId: email,
    details: { note: "impersonation link generated" },
  });

  return NextResponse.json({ ok: true, actionLink });
}
