import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lsLicenseKeyId?: string };

async function sendLicenseEmail(to: string, key: string): Promise<boolean> {
  const body = [
    `Here is your Influencer Butler license key:`,
    ``,
    `    ${key}`,
    ``,
    `Enter it in the desktop app to activate. Questions? Reply to this email.`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");
  const { ok } = await sendEmail({
    from: "Influencer Butler <hello@influencerbutler.com>",
    to,
    subject: "Your Influencer Butler license key",
    text: body,
    category: "license_resend",
  });
  return ok;
}

/** Emails a license key to its owner. Gated by licenses.resend. */
export async function POST(request: Request) {
  const actor = await requirePermission("licenses.resend", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.lsLicenseKeyId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing lsLicenseKeyId" }, { status: 400 });
  }

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: row } = await svc
    .from("license_keys")
    .select("key,user_id")
    .eq("ls_license_key_id", id)
    .maybeSingle();
  const key = typeof row?.key === "string" ? row.key : null;
  const userId = typeof row?.user_id === "string" ? row.user_id : null;
  if (!key || !userId) {
    return NextResponse.json({ error: "License not found." }, { status: 404 });
  }

  const { data: userRes } = await svc.auth.admin.getUserById(userId);
  const email = userRes?.user?.email ?? null;
  if (!email) {
    return NextResponse.json({ error: "Could not resolve owner email." }, { status: 404 });
  }

  const sent = await sendLicenseEmail(email, key);

  await logAdminAction({
    actor,
    action: "licenses.resend",
    targetType: "license",
    targetId: id,
    details: { emailSent: sent },
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Email not sent (Resend not configured)." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
