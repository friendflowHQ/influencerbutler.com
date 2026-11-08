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
 * carries { type: "daily-deals-workspace" } for a comped Deals add-on.
 */
import { NextResponse, after } from "next/server";
import { adminService, type AdminService } from "@/lib/admin-service";
import { hashLicenseKey } from "@/lib/license-auth";
import { safeEqual } from "@/lib/auth-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIVE_STATUSES = ["active", "on_trial", "past_due"];
// "revoked" is the only status our own flows write as a deliberate kill switch
// (the admin licenses.revoke route). Every other dead-looking value
// (disabled, inactive, expired, cancelled) is a Lemon Squeezy mirror: LS keeps
// a subscription's key disabled/inactive until the first payment clears, so a
// legitimate on_trial customer's key can carry one. Those keys are judged
// instead by the live-subscription check below, which is the real entitlement
// gate: a genuinely churned customer has no live subscription and still fails.
// "paused" is deliberately excluded: a self-serve pause (/api/subscription/pause)
// stops billing AND access until it resumes, same as a cancellation.
const DEAD_KEY_STATUSES = new Set(["revoked"]);

export async function POST(request: Request) {
  const secret = process.env.LICENSING_WORKER_SECRET;
  if (!secret) {
    console.error("inhouse-validate: LICENSING_WORKER_SECRET not set");
    return NextResponse.json({ valid: false, error: "not_configured" }, { status: 503 });
  }
  if (!safeEqual(request.headers.get("x-ib-worker-secret") || "", secret)) {
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
  const cols = "id,user_id,status,activation_limit";
  let lic = (await svc.from("license_keys").select(cols).eq("key_hash", hashLicenseKey(keyValue)).maybeSingle()).data;
  if (!lic?.user_id) {
    lic = (await svc.from("license_keys").select(cols).eq("key", keyValue).maybeSingle()).data;
  }
  const userId = lic?.user_id ? String(lic.user_id) : null;
  const licenseKeyId = lic?.id ? String(lic.id) : null;
  if (!userId) return NextResponse.json({ valid: false });

  const licStatus = typeof lic?.status === "string" ? lic.status.toLowerCase() : null;
  if (licStatus && DEAD_KEY_STATUSES.has(licStatus)) return NextResponse.json({ valid: false });
  const activationLimit = typeof lic?.activation_limit === "number" ? lic.activation_limit : null;

  // The entitlement is a live subscription for this user (Pro tier and/or the
  // Deals add-on). No live subscription -> not valid.
  const subs =
    (
      await svc
        .from("subscriptions")
        .select("status,ls_variant_id,created_at")
        .eq("user_id", userId)
        .in("status", LIVE_STATUSES)
        .order("created_at", { ascending: false })
    ).data ?? [];
  if (subs.length === 0) {
    // The key is ours and belongs to a real account, it just has no live plan
    // any more (a comp that ended, or a cancelled plan). Say so explicitly so the
    // licensing worker and desktop treat it as "access ended" (drop to the Free
    // Forever butlers) rather than as an unknown key / network blip.
    return NextResponse.json({ valid: false, reason: "access_ended", ...(await endedCompInfo(svc, userId)) });
  }

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

  // Record that this comp's key checked in (first activation + last seen), so the
  // Comps page can show "Active". Best-effort, off the response path.
  if (licenseKeyId) after(() => stampSeen(svc, licenseKeyId));

  // When the live plan is a comp, tell the desktop when it ends so it can show
  // the days-left banner and the end screen.
  const comp = await liveCompInfo(svc, userId);

  return NextResponse.json({
    valid: true,
    ...(comp ?? {}),
    email: typeof email === "string" ? email : null,
    status: primaryStatus || "active",
    variantId: primaryVariantId ? Number(primaryVariantId) : null,
    productId: null,
    activationLimit,
    addons,
  });
}

/**
 * Stamp the comp_grants row for a license key: last_seen_at every time, and
 * activated_at once (first check-in). Best-effort; keyed by license_key_id so it
 * only ever touches the in-house comp that minted this key.
 */
async function stampSeen(svc: AdminService, licenseKeyId: string): Promise<void> {
  try {
    const nowIso = new Date().toISOString();
    const existing = await svc
      .from("comp_grants")
      .select("activated_at")
      .eq("license_key_id", licenseKeyId)
      .maybeSingle();
    if (!existing.data) return;
    const patch: Record<string, unknown> = { last_seen_at: nowIso, updated_at: nowIso };
    if (!existing.data.activated_at) patch.activated_at = nowIso;
    await svc.from("comp_grants").update(patch).eq("license_key_id", licenseKeyId);
  } catch (err) {
    console.warn("inhouse-validate: stampSeen failed", err);
  }
}

type CompInfo = {
  expiresAt: string | null;
  compEndsAt: string | null;
  compKind: string | null;
  compPlan: string | null;
};

/**
 * The running comp for a user, if their live plan is a comp: the latest future
 * comp_grants.expires_at that has not been cancelled, and no live PAID plan
 * alongside it (a converted user is no longer "on a comp"). Best-effort.
 */
async function liveCompInfo(svc: AdminService, userId: string): Promise<CompInfo | null> {
  try {
    const grants = await readGrants(svc, userId);
    const now = Date.now();
    const open = grants
      .filter((g) => !g.cancelled_at && !g.converted_at && g.expires_at && new Date(g.expires_at).getTime() > now)
      .sort((a, b) => new Date(b.expires_at as string).getTime() - new Date(a.expires_at as string).getTime());
    if (open.length === 0) return null;
    const g = open[0];
    return {
      expiresAt: g.expires_at,
      compEndsAt: g.expires_at,
      compKind: g.kind ?? null,
      compPlan: await compPlanName(svc, g.ls_subscription_id),
    };
  } catch {
    return null;
  }
}

/** For an ended comp: when it ended and what kind it was (for the end screen). */
async function endedCompInfo(svc: AdminService, userId: string): Promise<Partial<CompInfo> & { compEnded?: boolean }> {
  try {
    const grants = await readGrants(svc, userId);
    const ended = grants
      .filter((g) => g.expires_at)
      .sort((a, b) => new Date(b.expires_at as string).getTime() - new Date(a.expires_at as string).getTime());
    if (ended.length === 0) return {};
    const g = ended[0];
    return {
      compEnded: true,
      compEndsAt: g.expires_at,
      compKind: g.kind ?? null,
      compPlan: await compPlanName(svc, g.ls_subscription_id),
    };
  } catch {
    return {};
  }
}

type GrantRow = {
  ls_subscription_id: string;
  expires_at: string | null;
  cancelled_at: string | null;
  converted_at?: string | null;
  kind?: string | null;
};

async function readGrants(svc: AdminService, userId: string): Promise<GrantRow[]> {
  const full = await svc
    .from("comp_grants")
    .select("ls_subscription_id,expires_at,cancelled_at,converted_at,kind")
    .eq("user_id", userId)
    .limit(20);
  if (!full.error) return (full.data ?? []) as GrantRow[];
  // Pre-migration prod (no kind / converted_at columns yet).
  const base = await svc
    .from("comp_grants")
    .select("ls_subscription_id,expires_at,cancelled_at")
    .eq("user_id", userId)
    .limit(20);
  return (base.data ?? []) as GrantRow[];
}

/** The plan name on the comp's subscription, with the "(comp)" suffix stripped. */
async function compPlanName(svc: AdminService, lsSubscriptionId: string): Promise<string | null> {
  const r = await svc
    .from("subscriptions")
    .select("plan_name")
    .eq("ls_subscription_id", lsSubscriptionId)
    .maybeSingle();
  const name = typeof r.data?.plan_name === "string" ? r.data.plan_name : null;
  return name ? name.replace(/\s*\(comp\)\s*$/i, "") : null;
}
