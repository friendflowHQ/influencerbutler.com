import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { captureSignupReferral } from "@/lib/referral-signup-capture";
import { captureFriendReferral } from "@/lib/referral-program";

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

      // All email-confirmed signups (password confirm + magic link) land
      // here, in the same browser that clicked any affiliate link - so this
      // is where the first-touch ib_aff_src cookie gets stamped onto the new
      // profile. Best-effort: the helper swallows every failure and the
      // internal new-account guard skips ordinary logins of old accounts.
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const cookieStore = await cookies();
        await captureSignupReferral({
          userId: userData.user.id,
          userCreatedAt: userData.user.created_at ?? null,
          userEmail: userData.user.email ?? null,
          cookieStore,
        });
        // Consumer referral: give a referred friend their free month of Pro.
        // Gated by REFERRAL_PROGRAM_ENABLED inside; best-effort.
        await captureFriendReferral({
          userId: userData.user.id,
          userCreatedAt: userData.user.created_at ?? null,
          userEmail: userData.user.email ?? null,
          cookieStore,
        });
      }
    }

    return NextResponse.redirect(new URL(next, url.origin));
  } catch (error) {
    console.error("Auth callback route error", error);
    return NextResponse.redirect(new URL("/login", url.origin));
  }
}
