import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLicenseInstances, deactivateLicenseInstance } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/me/license/activations  - lists the signed-in user's activated
 *      devices, read live from Lemon Squeezy. A user can hold SEVERAL license
 *      keys (one per order: plan changes, add-ons, regrants), and the desktop
 *      app activates whichever one they pasted - so devices are aggregated
 *      across ALL of their keys, not just one arbitrary row (that arbitrary
 *      pick is exactly what made a fresh activation show "0 devices").
 * POST /api/me/license/activations  { action: "deactivate", instanceId }
 *      Frees up one activation seat. The instanceId is validated against the
 *      user's own instance lists server-side and deactivated with the key it
 *      belongs to.
 */

type LicenseRow = {
  ls_license_key_id?: string | number | null;
  key?: string | null;
  status?: string | null;
  activation_limit?: number | null;
};

type DeviceInstance = {
  identifier: string;
  name: string | null;
  createdAt: string | null;
  /** Which of the user's keys this device is activated on (internal LS id). */
  lsLicenseKeyId: string;
};

async function readOwnLicenses(userId: string): Promise<LicenseRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("license_keys")
    .select("ls_license_key_id,key,status,activation_limit,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as LicenseRow[];
}

/**
 * Fetches instances for every key. Returns null when EVERY lookup failed
 * (LS unreachable); partial failures just skip that key's devices.
 */
async function collectDevices(rows: LicenseRow[]): Promise<DeviceInstance[] | null> {
  const withIds = rows.filter((r) => r.ls_license_key_id != null);
  if (withIds.length === 0) return [];
  const results = await Promise.all(
    withIds.map(async (row) => {
      const lsId = String(row.ls_license_key_id);
      const instances = await fetchLicenseInstances(lsId);
      if (instances === null) return null;
      return instances.map((i) => ({
        identifier: i.identifier,
        name: i.name,
        createdAt: i.createdAt,
        lsLicenseKeyId: lsId,
      }));
    }),
  );
  if (results.every((r) => r === null)) return null;
  return results.filter((r): r is DeviceInstance[] => r !== null).flat();
}

/**
 * Total seats: sum of the ACTIVE keys' limits (users accumulate inactive keys
 * from plan changes and test orders; counting those seats would show a bogus
 * "1 of 8"). Falls back to all keys when none is active; null when no key
 * declares a limit.
 */
function totalLimit(rows: LicenseRow[]): number | null {
  const active = rows.filter((r) => r.status === "active");
  const pool = active.length > 0 ? active : rows;
  const limits = pool
    .map((r) => r.activation_limit)
    .filter((n): n is number => typeof n === "number" && n > 0);
  if (limits.length === 0) return null;
  return limits.reduce((a, b) => a + b, 0);
}

async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function GET() {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await readOwnLicenses(user.id);
  if (rows.length === 0) {
    return NextResponse.json({ activationLimit: null, instances: [] });
  }

  const devices = await collectDevices(rows);
  if (devices === null) {
    // LS unreachable: tell the client to show a quiet failure, not an empty list.
    return NextResponse.json({ activationLimit: totalLimit(rows), instances: null });
  }

  return NextResponse.json({
    activationLimit: totalLimit(rows),
    instances: devices,
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { action?: string; instanceId?: string };
  try {
    body = (await request.json()) as { action?: string; instanceId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (body.action !== "deactivate" || typeof body.instanceId !== "string" || !body.instanceId) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const rows = await readOwnLicenses(user.id);
  if (rows.length === 0) {
    return NextResponse.json({ error: "No license found" }, { status: 404 });
  }

  const before = await collectDevices(rows);
  if (before === null) {
    return NextResponse.json({ error: "Could not reach Lemon Squeezy" }, { status: 502 });
  }
  // Ownership check: only instances on this user's keys can be named.
  const target = before.find((i) => i.identifier === body.instanceId);
  if (!target) {
    // Already gone (deactivated elsewhere) counts as done.
    return NextResponse.json({ ok: true, instances: before });
  }

  const owningKey = rows.find(
    (r) => r.ls_license_key_id != null && String(r.ls_license_key_id) === target.lsLicenseKeyId,
  );
  if (!owningKey?.key) {
    return NextResponse.json({ error: "License key unavailable" }, { status: 500 });
  }

  const deactivated = await deactivateLicenseInstance(owningKey.key, target.identifier);

  const after = await collectDevices(rows);
  const stillThere = (after ?? before).some((i) => i.identifier === target.identifier);
  if (!deactivated && stillThere) {
    return NextResponse.json({ error: "Deactivation failed. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, instances: after ?? [] });
}
