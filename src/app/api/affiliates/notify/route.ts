import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type NotifyBody = {
  userId?: string;
  fullName?: string;
  email?: string;
};

export async function POST(request: Request) {
  // Best-effort admin email. Non-critical — the application row is already
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

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Influencer Butler <affiliates@influencerbutler.com>",
        to: [to],
        subject: `New affiliate application: ${name}`,
        text: [
          `New affiliate application submitted.`,
          ``,
          `Name: ${body.fullName ?? "—"}`,
          `Email: ${body.email ?? "—"}`,
          `User ID: ${body.userId ?? "—"}`,
          ``,
          `Full details: Supabase affiliate_applications table.`,
        ].join("\n"),
      }),
    });
    return NextResponse.json({ ok: true, sent: true });
  } catch (error) {
    console.error("Affiliate admin notification failed", error);
    return NextResponse.json({ ok: true, sent: false, reason: "send_failed" });
  }
}
