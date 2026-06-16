import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveTierRoute } from "@/app/welcome/page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Auth-guarded endpoint used by the /welcome poll client. Returns the correct
 * tier route (or null if the webhook hasn't landed yet) so the client can
 * redirect as soon as the subscription row appears.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Service-role read (bypasses RLS): the subscriptions table has no SELECT
  // policy, so the cookie-bound anon client would see no rows and the poll
  // would never resolve a tier route for a freshly-checked-out user.
  const admin = createAdminClient();
  const { data: subs } = await admin
    .from("subscriptions")
    .select("status,ls_variant_id")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .limit(1);

  const sub = subs && subs.length > 0 ? (subs[0] as { status: string | null; ls_variant_id: string | null }) : null;
  const tierRoute = resolveTierRoute(sub);

  return NextResponse.json({ tierRoute });
}
