import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";
import { sendEmail } from "@/lib/email-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { email?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

async function sendMagicLinkEmail(to: string, actionLink: string): Promise<boolean> {
  const body = [
    `Here is your Influencer Butler sign-in link:`,
    ``,
    `    ${actionLink}`,
    ``,
    `This link signs you in automatically. If you didn't request it, you can ignore this email.`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");
  const { ok } = await sendEmail({
    from: "Influencer Butler <hello@influencerbutler.com>",
    to,
    subject: "Your Influencer Butler sign-in link",
    text: body,
    category: "auth_resend",
  });
  return ok;
}

/** Resends a sign-in magic link to a user. */
export async function POST(request: Request) {
  const actor = await requirePermission("users.resend_auth", request);
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
    console.error("users/resend-auth: generateLink failed", linkErr);
    return NextResponse.json({ error: "Could not generate sign-in link." }, { status: 502 });
  }

  const sent = await sendMagicLinkEmail(email, actionLink);

  await logAdminAction({
    actor,
    action: "users.resend_auth",
    targetType: "user",
    targetId: email,
    details: { emailSent: sent },
  });

  if (!sent) {
    return NextResponse.json(
      { error: "Link generated but email not sent (Resend not configured)." },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true });
}
