import { createClient } from "@/lib/supabase/server";
import { sendSignupMetaEvent } from "@/lib/meta-capi";

export const runtime = "nodejs";

/**
 * Meta CompleteRegistration hook for the magic-link sign-in path. The confirm
 * page (src/app/auth/confirm/page.tsx) redeems the token with verifyOtp in
 * the BROWSER, so those sessions never pass through /api/auth/callback where
 * the password/OAuth signup event fires. The page pings this route right
 * after a successful verifyOtp.
 *
 * Most arrivals here are webhook-provisioned buyers (already captured by the
 * Purchase event) or returning logins (skipped by the 1-hour new-account
 * guard in sendSignupMetaEvent); this route exists so a genuinely fresh
 * magic-link signup is not invisible to Meta. The deterministic
 * signup-<userId> event_id dedups against the callback path.
 *
 * Always returns 204: analytics must never surface an error to the client.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await sendSignupMetaEvent({
        userId: data.user.id,
        email: data.user.email ?? null,
        createdAt: data.user.created_at ?? null,
        headers: request.headers,
      });
    }
  } catch (error) {
    console.error("analytics/signup: error", error);
  }
  return new Response(null, { status: 204 });
}
