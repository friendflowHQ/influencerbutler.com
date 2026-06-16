import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client. Bypasses RLS - use only in trusted server
 * contexts (webhooks, server routes that have already authenticated the user
 * some other way) and never with values derived from request bodies.
 *
 * This is the same construction inlined in the Lemon Squeezy webhook handler:
 * canonical supabase-js (not @supabase/ssr) with autoRefresh/persist off so
 * writes and reads reliably carry the service_role JWT claim. The anon/ssr
 * client respects RLS, which is why dashboard reads of tables without a SELECT
 * policy (e.g. subscriptions) come back empty even when rows exist.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing Supabase service-role configuration (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
