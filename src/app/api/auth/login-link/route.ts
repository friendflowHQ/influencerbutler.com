import { NextResponse } from "next/server";
import { adminService, type AdminService } from "@/lib/admin-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Mode = "signin" | "reset";
type Body = { email?: string; mode?: string };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// One send per browser per 60s, matched by mode so a "sign-in link" and a
// "reset" request don't block each other. Blunts trivial spamming; Supabase
// rate-limits generateLink server-side as the real backstop.
const COOLDOWN_SECONDS = 60;
const COOLDOWN_COOKIE = "ib_login_link";

function hasCooldown(request: Request, mode: Mode): boolean {
  return (request.headers.get("cookie") ?? "")
    .split(";")
    .some((c) => c.trim().startsWith(`${COOLDOWN_COOKIE}_${mode}=`));
}

async function sendLinkEmail(
  to: string,
  mode: Mode,
  actionLink: string,
  isNew: boolean,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const subject =
    mode === "reset"
      ? isNew
        ? "Set your Influencer Butler password"
        : "Reset your Influencer Butler password"
      : isNew
        ? "Welcome to Influencer Butler: your sign-in link"
        : "Your Influencer Butler sign-in link";
  const lead =
    mode === "reset"
      ? isNew
        ? "Here is your link to set your Influencer Butler password:"
        : "Here is your link to reset your Influencer Butler password:"
      : isNew
        ? "Welcome to Influencer Butler! We set up your account. Here is your sign-in link:"
        : "Here is your Influencer Butler sign-in link:";
  const closing =
    mode === "reset"
      ? "It opens a page where you can set a new password. If you didn't request it, you can ignore this email."
      : isNew
        ? "This link signs you in automatically. If you didn't request it, you can ignore this email and the account will simply sit unused."
        : "This link signs you in automatically. If you didn't request it, you can ignore this email.";
  const text = [
    lead,
    ``,
    `    ${actionLink}`,
    ``,
    closing,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Influencer Butler <hello@influencerbutler.com>",
        to: [to],
        subject,
        text,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Create the auth user + profiles row for an email we've never seen, and
 * report whether it was new. Standard passwordless-signup semantics: the
 * account is inert until someone proves inbox ownership via the emailed link,
 * and /signup already lets anyone create an account, so this adds no new
 * exposure. created_via metadata makes bulk cleanup easy if ever abused.
 *
 * Run BEFORE generateLink so unknown emails (walkthrough leads who installed
 * the desktop app but never registered on the website) get a real account and
 * a usable link instead of a silent dead end.
 */
async function ensureUser(svc: AdminService, email: string): Promise<boolean> {
  const created = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { created_via: "login_link" },
  });
  const userId = created.data.user?.id ?? null;
  if (!userId) {
    // "already registered" is the normal existing-account case.
    if (!/already.*(registered|exists)|duplicate/i.test(created.error?.message ?? "")) {
      console.error("auth/login-link: createUser failed", { reason: created.error?.message });
    }
    return false;
  }

  // No handle_new_user trigger exists; every creation path makes the profiles
  // row explicitly. Best effort - the sign-in link works either way.
  const prof = await svc.from("profiles").upsert({ id: userId, email }, { onConflict: "id" });
  if (prof.error) console.error("auth/login-link: profiles upsert failed", prof.error);
  return true;
}

/**
 * Public, unauthenticated recovery for the /login page. Emails the visitor a
 * one-time sign-in link (mode "signin") or a password-reset link (mode
 * "reset"). Both use the reliable admin generateLink + Resend path, not
 * Supabase's built-in mailer.
 *
 * Unknown emails get an account created on the fly (see ensureUser), so a
 * desktop-app walkthrough lead who never registered on the website can still
 * get in from here. Always responds { ok: true } regardless of whether the
 * account previously existed or the send succeeded, so the endpoint never
 * reveals which emails have accounts.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const mode: Mode = body.mode === "reset" ? "reset" : "signin";

  // Invalid email is the only thing we surface, since it's about the input the
  // visitor just typed, not whether an account exists.
  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const ok = NextResponse.json({ ok: true });

  // Cooldown and misconfiguration both fall through to the same generic ok, so
  // response shape and timing don't leak account existence.
  if (hasCooldown(request, mode)) {
    return ok;
  }

  const svc = adminService();
  if (!svc) {
    console.error("auth/login-link: adminService unavailable (service role key missing)");
  } else {
    const siteUrl =
      process.env.SITE_URL ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "https://www.influencerbutler.com";
    const base = siteUrl.replace(/\/$/, "");

    // Provision unknown emails first so generateLink has an account to issue a
    // token for. This is the only place unauthenticated account creation
    // happens outside /signup; log it as an audit trail.
    const isNew = await ensureUser(svc, email);
    if (isNew) {
      console.error("auth/login-link: provisioned new user", {
        mode,
        email,
        ip: request.headers.get("x-forwarded-for") ?? "unknown",
      });
    }

    const { data, error } = await svc.auth.admin.generateLink({
      type: mode === "reset" ? "recovery" : "magiclink",
      email,
      options: { redirectTo: mode === "reset" ? `${base}/reset-password` : `${base}/dashboard` },
    });

    // We do NOT email Supabase's action_link. That link points at the single-use
    // /auth/v1/verify endpoint, which email security scanners and link
    // pre-fetchers (Outlook SafeLinks, antivirus, corporate proxies) burn by
    // simply GET-ing it, so the real user then sees "link already used". Instead
    // we email a link to one of our own pages carrying the token_hash and redeem
    // it with verifyOtp only on a deliberate click/submit a scanner never
    // performs: reset lands on /reset-password (redeems when the new password is
    // submitted), sign-in lands on /auth/confirm (redeems on a Confirm button).
    // hashed_token is returned at runtime but missing from the installed
    // @supabase/supabase-js property types, which only declare action_link.
    const hashedToken =
      (data?.properties as { hashed_token?: string } | undefined)?.hashed_token ?? null;
    const actionLink = hashedToken
      ? mode === "reset"
        ? `${base}/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`
        : `${base}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent("/dashboard")}`
      : null;
    // generateLink errors for unknown emails; swallow it so we stay generic.
    // Log it server-side anyway: the client always sees success, so this is the
    // only trace of "customer swears they never got the email."
    if (error || !actionLink) {
      console.error("auth/login-link: no link generated", { mode, reason: error?.message });
    } else {
      const sent = await sendLinkEmail(email, mode, actionLink, isNew);
      if (!sent) console.error("auth/login-link: Resend send failed", { mode });
    }
  }

  ok.cookies.set({
    name: `${COOLDOWN_COOKIE}_${mode}`,
    value: "1",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOLDOWN_SECONDS,
  });
  return ok;
}
