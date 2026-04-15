import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/affiliates/portal"];

export function middleware(request: NextRequest) {
  // Check for Supabase auth cookies to determine if user is logged in.
  // We check for cookies rather than calling Supabase server-side because
  // Vercel edge functions have DNS resolution issues with Supabase.
  // Matches sb-<ref>-auth-token and chunked variants like sb-<ref>-auth-token.0
  const hasAuthCookie = request.cookies.getAll().some(
    (cookie) => /^sb-.+-auth-token(\.\d+)?$/.test(cookie.name),
  );

  const pathname = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasAuthCookie) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/affiliates/portal/:path*"],
};
