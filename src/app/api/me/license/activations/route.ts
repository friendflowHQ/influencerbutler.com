import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLicenseInstances, deactivateLicenseInstance } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/me/license/activations  - the signed-in user's activated devices,
 *      read live from Lemon Squeezy and grouped PER LICENSE KEY (per product):
 *      a Team Pro key and a Daily Deals add-on key each get their own group
 *      with their own seat count, instead of one misleading combined pool.
 *      Groups are labeled with the owning subscription's plan name when the
 *      key is linked to one. Inactive keys are omitted unless they still have
 *      live instances (those must stay visible so they can be deactivated).
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
  subscription_id?: string | null;
};

type DeviceInstance = {
  identifier: string;
  name: string | null;
  createdAt: string | null;
};

type DeviceGroup = {
  /** Internal LS id of the key this group belongs to. */
  lsLicenseKeyId: string;
  /** Product label, e.g. "Team Pro" or "Daily Deals Workspace"; null when unknown. */
  label: string | null;
  status: string | null;
  activationLimit: number | null;
  instances: DeviceInstance[];
};

async function readOwnLicenses(userId: string): Promise<LicenseRow[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("license_keys")
    .select("ls_license_key_id,key,status,activation_limit,subscription_id,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);
  return (data ?? []) as LicenseRow[];
}

/** Maps the user's subscription row ids to plan names, best-effort. */
async function readPlanNames(userId: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("subscriptions")
      .select("id,plan_name")
      .eq("user_id", userId)
      .limit(20);
    for (const row of (data ?? []) as { id?: string | null; plan_name?: string | null }[]) {
      if (row.id && row.plan_name) map.set(row.id, row.plan_name);
    }
  } catch {
    // labels are cosmetic; groups fall back to unlabeled
  }
  return map;
}

/**
 * Builds per-key device groups. Returns null when EVERY Lemon Squeezy lookup
 * failed (LS unreachable); a partial failure just drops that key's group.
 */
async function collectGroups(
  rows: LicenseRow[],
  planNames: Map<string, string>,
): Promise<DeviceGroup[] | null> {
  const withIds = rows.filter((r) => r.ls_license_key_id != null);
  if (withIds.length === 0) return [];
  const results = await Promise.all(
    withIds.map(async (row): Promise<DeviceGroup | null | "ls-error"> => {
      const lsId = String(row.ls_license_key_id);
      const instances = await fetchLicenseInstances(lsId);
      if (instances === null) return "ls-error";
      const group: DeviceGroup = {
        lsLicenseKeyId: lsId,
        label: (row.subscription_id && planNames.get(row.subscription_id)) || null,
        status: row.status ?? null,
        activationLimit: row.activation_limit ?? null,
        instances: instances.map((i) => ({
          identifier: i.identifier,
          name: i.name,
          createdAt: i.createdAt,
        })),
      };
      // Inactive keys with no devices are noise (plan changes, test orders).
      if (group.status !== "active" && group.instances.length === 0) return null;
      return group;
    }),
  );
  if (results.every((r) => r === "ls-error")) return null;
  return results.filter((r): r is DeviceGroup => r !== null && r !== "ls-error");
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
    return NextResponse.json({ groups: [] });
  }

  const planNames = await readPlanNames(user.id);
  const groups = await collectGroups(rows, planNames);
  if (groups === null) {
    // LS unreachable: tell the client to show a quiet failure, not an empty list.
    return NextResponse.json({ groups: null });
  }

  return NextResponse.json({ groups });
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

  const planNames = await readPlanNames(user.id);
  const before = await collectGroups(rows, planNames);
  if (before === null) {
    return NextResponse.json({ error: "Could not reach Lemon Squeezy" }, { status: 502 });
  }
  // Ownership check: only instances on this user's keys can be named.
  const owningGroup = before.find((g) =>
    g.instances.some((i) => i.identifier === body.instanceId),
  );
  if (!owningGroup) {
    // Already gone (deactivated elsewhere) counts as done.
    return NextResponse.json({ ok: true, groups: before });
  }

  const owningKey = rows.find(
    (r) => r.ls_license_key_id != null && String(r.ls_license_key_id) === owningGroup.lsLicenseKeyId,
  );
  if (!owningKey?.key) {
    return NextResponse.json({ error: "License key unavailable" }, { status: 500 });
  }

  const deactivated = await deactivateLicenseInstance(owningKey.key, body.instanceId);

  const after = await collectGroups(rows, planNames);
  const stillThere = (after ?? before).some((g) =>
    g.instances.some((i) => i.identifier === body.instanceId),
  );
  if (!deactivated && stillThere) {
    return NextResponse.json({ error: "Deactivation failed. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, groups: after ?? [] });
}
