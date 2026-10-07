import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-send";
import { createClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { crossSiteBlocked } from "@/lib/request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELD_MAX = 120;

/** Strip control characters / newlines and cap length so nothing a caller
 *  controls can forge extra lines or headers in the admin email. */
function clean(value: unknown): string {
  if (typeof value !== "string") return "-";
  // Collapse control characters and Unicode line separators to spaces.
  const flat = Array.from(value, (ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 || c === 0x2028 || c === 0x2029 ? " " : ch; }).join("").replace(/ +/g, " ").trim();
  return flat ? flat.slice(0, FIELD_MAX) : "-";
}

/**
 * Best-effort admin email when someone submits an affiliate application.
 *
 * SECURITY: requires a signed-in Supabase session (the apply flows always
 * create the application row as the signed-in user before calling this). The
 * request body is ignored entirely: the name, email and user id in the email
 * come from the session and from the caller's own affiliate_applications row
 * (RLS-scoped), so nobody can make us email the admin attacker-chosen text.
 * Rate limited per IP and per user.
 */
export async function POST(request: Request) {
  const blocked = crossSiteBlocked(request);
  if (blocked) return blocked;

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!apiKey || !to) {
    return NextResponse.json({ ok: true, sent: false, reason: "not_configured" });
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  const ip = clientIp(request);
  const [byIp, byUser] = await Promise.all([
    rateLimit(`affiliate-notify:ip:${ip}`, 10, 3600),
    rateLimit(`affiliate-notify:user:${user.id}`, 3, 3600),
  ]);
  if (!byIp.allowed || !byUser.allowed) {
    return NextResponse.json(
      { ok: false, error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(Math.max(byIp.retryAfterSec, byUser.retryAfterSec)) } },
    );
  }

  // The caller's own application row (RLS: auth.uid() = user_id).
  const { data: app } = await supabase
    .from("affiliate_applications")
    .select("full_name, email, status")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!app) {
    // Nothing to announce: the application was not actually saved.
    return NextResponse.json({ ok: true, sent: false, reason: "no_application" });
  }

  const row = app as { full_name?: string | null; email?: string | null };
  const email = clean(row.email ?? user.email);
  const name = clean(row.full_name ?? email);

  const { ok: sent } = await sendEmail({
    from: "Influencer Butler <affiliates@influencerbutler.com>",
    to,
    subject: `New affiliate application: ${name}`,
    text: [
      `New affiliate application submitted.`,
      ``,
      `Name: ${name}`,
      `Email: ${email}`,
      `User ID: ${user.id}`,
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
