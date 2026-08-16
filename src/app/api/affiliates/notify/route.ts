import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotifyBody = {
  userId?: string;
  fullName?: string;
  email?: string;
};

export async function POST(request: Request) {
  // Best-effort admin email. Non-critical - the application row is already
  // saved by the client before this endpoint is called.
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;

  if (!apiKey || !to) {
    return NextResponse.json({ ok: true, sent: false, reason: "not_configured" });
  }

  let body: NotifyBody;
  try {
    body = (await request.json()) as NotifyBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const name = body.fullName?.trim() || body.email?.trim() || "Unknown applicant";

  const { ok: sent } = await sendEmail({
    from: "Influencer Butler <affiliates@influencerbutler.com>",
    to,
    subject: `New affiliate application: ${name}`,
    text: [
      `New affiliate application submitted.`,
      ``,
      `Name: ${body.fullName ?? "-"}`,
      `Email: ${body.email ?? "-"}`,
      `User ID: ${body.userId ?? "-"}`,
      ``,
      `Full details: Supabase affiliate_applications table.`,
    ].join("\n"),
    category: "affiliate_notify",
  });
  if (!sent) {
    return NextResponse.json({ ok: true, sent: false, reason: "send_failed" });
  }
  return NextResponse.json({ ok: true, sent: true });
}
