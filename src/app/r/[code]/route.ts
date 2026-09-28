import { NextResponse } from "next/server";
import { REFERRAL_COOKIE } from "@/lib/referral-program";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Consumer referral share link: /r/<code>. Drops the ib_ref cookie (read at
// signup by captureFriendReferral) and sends the visitor to the homepage. Kept
// dead simple and public; the reward logic and its REFERRAL_PROGRAM_ENABLED gate
// live at capture time, so an old link never mints anything while the program
// is off.

const COOKIE_MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const clean = (code ?? "").trim().slice(0, 40);

  const origin = new URL(request.url).origin;
  const res = NextResponse.redirect(new URL("/", origin), 302);
  res.headers.set("Cache-Control", "no-store");

  if (/^[A-Za-z0-9]{3,40}$/.test(clean)) {
    res.cookies.set({
      name: REFERRAL_COOKIE,
      value: clean.toUpperCase(),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }

  return res;
}
