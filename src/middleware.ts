import { NextResponse, type NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  // Check for Supabase auth cookies to determine if user is logged in.
  // We check for cookies rather than calling Supabase server-side because
  // Vercel edge functions have DNS resolution issues with Supabase.
  const hasAuthCookie = request.cookies.getAll().some(
    (cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
  );

  if (request.nextUrl.pathname.startsWith("/dashboard") && !hasAuthCookie) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
