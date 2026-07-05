/**
 * GET /api/entitlements - the single endpoint the desktop app and dashboard
 * call to learn what the caller can run.
 *
 * Auth: Authorization: Bearer <license-key> (desktop) OR the Supabase session
 * cookie (browser), via resolveAuth. A lapsed user still resolves identity from
 * their old license key, so we never hard-401 an expired customer: they get
 * tier:"free" with the free-forever butlers still unlocked.
 *
 * The desktop app keeps freeButlerSlugs running regardless of subscription
 * status and gates everything else behind allButlersUnlocked. See
 * docs/entitlements-spec.md.
 */
import { resolveAuth } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";
import { entitlementsFor, tierForSubscriptionStatus } from "@/lib/entitlements";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Match subscription-details: prefer active/on_trial, then past_due/cancelled.
const VISIBLE_STATUSES = ["active", "on_trial", "past_due", "cancelled", "paused"];

export function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const result = await resolveAuth(request);
  if (!result.ok) {
    return jsonWithCors({ error: result.error }, result.status);
  }

  const userId = result.auth.userId;
  let status: string | null = null;

  try {
    const admin = createAdminClient();
    // Service-role read (subscriptions RLS has no SELECT policy - see memory).
    const { data: subs } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .in("status", VISIBLE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = subs && subs.length > 0 ? (subs[0] as { status?: string | null }) : null;
    status = row?.status ?? null;
  } catch (error) {
    // Never fail closed: a lookup error still lets the free butlers run.
    console.warn("entitlements: subscription lookup failed", error);
  }

  const tier = tierForSubscriptionStatus(status);
  return jsonWithCors(entitlementsFor(tier, status));
}
