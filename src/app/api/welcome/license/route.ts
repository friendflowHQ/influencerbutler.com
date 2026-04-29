import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import {
  WELCOME_TOKEN_COOKIE,
  WELCOME_TOKEN_MAX_ORDER_AGE_MS,
} from "@/lib/welcome-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OrderRow = {
  user_id: string | null;
  created_at: string | null;
};

type SubscriptionRow = {
  id: string;
  status: string | null;
  ls_variant_id: string | null;
};

type LicenseKeyRow = {
  id: string;
  key: string | null;
  status: string | null;
  activation_limit: number | null;
};

/**
 * Public endpoint used by the /welcome thank-you page to fetch the buyer's
 * license key without requiring auth. The buyer is identified by the
 * HttpOnly `ib_welcome_token` cookie set on the /api/checkout(/guest) response
 * before the LS redirect.
 *
 * Lookup chain:
 *   cookie token -> orders.welcome_token -> orders.user_id
 *                -> latest subscription for that user
 *                -> license_key for that subscription
 *
 * Time-windowed (orders older than WELCOME_TOKEN_MAX_ORDER_AGE_MS are ignored)
 * so a leaked cookie can't keep pulling license keys days later — the legit
 * dashboard view at /dashboard/subscription is auth-gated and remains the
 * canonical place to see the key after the welcome window.
 *
 * Always responds 200 with a status field so the client can poll cheaply
 * while the LS webhook chain catches up (order_created -> subscription_created
 * -> license_key_created can take a few seconds in production).
 */
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(WELCOME_TOKEN_COOKIE)?.value ?? null;

  if (!token) {
    return NextResponse.json({ status: "no_token" });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("/api/welcome/license: missing Supabase service-role config");
    return NextResponse.json({ status: "config_error" }, { status: 500 });
  }

  // Service-role client: this endpoint legitimately reads license_keys without
  // a user session (that's the whole point), so we bypass RLS. Time/freshness
  // checks below are the security boundary, not RLS.
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: orderData, error: orderError } = await supabase
    .from("orders")
    .select("user_id, created_at")
    .eq("welcome_token", token)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orderError) {
    console.error("/api/welcome/license: order lookup failed", orderError);
    return NextResponse.json({ status: "lookup_error" }, { status: 500 });
  }

  const order = orderData as OrderRow | null;
  if (!order) {
    // Webhook hasn't landed yet — client should keep polling.
    return NextResponse.json({ status: "pending" });
  }

  const createdAtMs = order.created_at ? new Date(order.created_at).getTime() : NaN;
  if (!Number.isFinite(createdAtMs) || Date.now() - createdAtMs > WELCOME_TOKEN_MAX_ORDER_AGE_MS) {
    return NextResponse.json({ status: "expired" });
  }

  if (!order.user_id) {
    return NextResponse.json({ status: "pending" });
  }

  const { data: subData } = await supabase
    .from("subscriptions")
    .select("id, status, ls_variant_id")
    .eq("user_id", order.user_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const subscription = subData as SubscriptionRow | null;
  if (!subscription) {
    return NextResponse.json({ status: "pending" });
  }

  const { data: keyData } = await supabase
    .from("license_keys")
    .select("id, key, status, activation_limit")
    .eq("subscription_id", subscription.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const licenseKey = keyData as LicenseKeyRow | null;
  if (!licenseKey || !licenseKey.key) {
    // Subscription exists but license_key_created webhook hasn't arrived.
    return NextResponse.json({
      status: "pending",
      subscription: {
        status: subscription.status,
        ls_variant_id: subscription.ls_variant_id,
      },
    });
  }

  return NextResponse.json({
    status: "ready",
    license_key: {
      key: licenseKey.key,
      status: licenseKey.status,
      activation_limit: licenseKey.activation_limit,
    },
    subscription: {
      status: subscription.status,
      ls_variant_id: subscription.ls_variant_id,
    },
  });
}
