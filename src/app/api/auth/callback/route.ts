import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";

  try {
    if (code) {
      const supabase = await createClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        console.error("Supabase auth callback session exchange failed", error);
        return NextResponse.redirect(new URL("/login", url.origin));
      }
    }

    return NextResponse.redirect(new URL(next, url.origin));
  } catch (error) {
    console.error("Auth callback route error", error);
    return NextResponse.redirect(new URL("/login", url.origin));
  }
}
