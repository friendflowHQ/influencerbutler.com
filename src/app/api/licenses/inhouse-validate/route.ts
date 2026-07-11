/**
 * POST /api/licenses/inhouse-validate
 *
 * Server-to-server endpoint the desktop licensing Cloudflare Worker calls as a
 * FALLBACK when Lemon Squeezy's license API rejects a key. In-house comp keys
 * (minted by src/lib/comp-issue.ts) are not in Lemon Squeezy, so LS validation
 * fails for them; the worker then asks here whether the key is a valid in-house
 * grant and, if so, activates it.
 *
 * Auth: the worker must send x-ib-worker-secret == LICENSING_WORKER_SECRET (set
 * in Vercel AND as a wrangler secret on the worker). Without a matching secret
 * we never reveal anything.
 *
 * Returns the shape the worker's /license/validate reshapes for the desktop:
 *   { valid, email, status, variantId, productId, activationLimit, addons }
 * where variantId maps to a tier via the desktop's tierForVariantId, and addons
 * carries { type: "daily-deals-workspace" } for a comped Daily Deals add-on.
 */
import { NextResponse } from "next/server";
import { adminService } from "@/lib/admin-service";
import { hashLicenseKey } from "@/lib/license-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];
const DEAD_KEY_STATUSES = new Set(["revoked", "disabled", "expired", "cancelled"]);

export async function POST(request: Request) {
  const secret = process.env.LICENSING_WORKER_SECRET;
  if (!secret) {
    console.error("inhouse-validate: LICENSING_WORKER_SECRET not set");
    return NextResponse.json({ valid: false, error: "not_configured" }, { status: 503 });
  }
  if ((request.headers.get("x-ib-worker-secret") || "") !== secret) {
    return NextResponse.json({ valid: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { keyValue?: unknown };
  try {
    body = (await request.json()) as { keyValue?: unknown };
  } catch {
    body = {};
  }
  const keyValue = typeof body.keyValue === "string" ? body.keyValue.trim() : "";
  if (!keyValue) return NextResponse.json({ valid: false, error: "key_required" }, { status: 400 });

  const svc = adminService();
  if (!svc) return NextResponse.json({ valid: false, error: "server_error" }, { status: 500 });

  // Resolve the key to a user (hash first, plaintext fallback).
  const cols = "user_id,status,activation_limit";
  let lic = (await svc.from("license_keys").select(cols).eq("key_hash", hashLicenseKey(keyValue)).maybeSingle()).data;
  if (!lic?.user_id) {
    lic = (await svc.from("license_keys").select(cols).eq("key", keyValue).maybeSingle()).data;
  }
  const userId = lic?.user_id ? String(lic.user_id) : null;
  if (!userId) return NextResponse.json({ valid: false });

  const licStatus = typeof lic?.status === "string" ? lic.status.toLowerCase() : null;
  if (licStatus && DEAD_KEY_STATUSES.has(licStatus)) return NextResponse.json({ valid: false });
  const activationLimit = typeof lic?.activation_limit === "number" ? lic.activation_limit : null;

  // The entitlement is a live subscription for this user (Pro tier and/or the
  // Daily Deals add-on). No live subscription -> not valid.
  const subs =
    (
      await svc
        .from("subscriptions")
        .select("status,ls_variant_id,created_at")
        .eq("user_id", userId)
        .in("status", LIVE_STATUSES)
        .order("created_at", { ascending: false })
    ).data ?? [];
  if (subs.length === 0) return NextResponse.json({ valid: false });

  const dailyDealsVariant = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON || null;
  const addons: Array<{ type: string; status: string; variantId: number | null }> = [];
  let primaryVariantId: string | null = null;
  let primaryStatus: string | null = null;
  for (const s of subs) {
    const v = s.ls_variant_id != null ? String(s.ls_variant_id) : null;
    const st = typeof s.status === "string" ? s.status : "active";
    if (dailyDealsVariant && v === dailyDealsVariant) {
      addons.push({ type: "daily-deals-workspace", status: st, variantId: Number(v) });
    } else if (!primaryVariantId) {
      primaryVariantId = v;
      primaryStatus = st;
    }
  }
  // Add-on-only comp (no primary plan): use the add-on variant as the primary so
  // the key still unlocks the app for the recipient.
  if (!primaryVariantId && addons.length > 0) {
    primaryVariantId = dailyDealsVariant;
    primaryStatus = addons[0].status;
  }

  const email = (await svc.from("profiles").select("email").eq("id", userId).maybeSingle()).data?.email;

  return NextResponse.json({
    valid: true,
    email: typeof email === "string" ? email : null,
    status: primaryStatus || "active",
    variantId: primaryVariantId ? Number(primaryVariantId) : null,
    productId: null,
    activationLimit,
    addons,
  });
}
