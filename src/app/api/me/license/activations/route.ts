import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchLicenseInstances, deactivateLicenseInstance } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET  /api/me/license/activations  - lists the signed-in user's activated
 *      devices for their license key, read live from Lemon Squeezy (nothing
 *      local ever writes activation data).
 * POST /api/me/license/activations  { action: "deactivate", instanceId }
 *      Frees up one activation seat. The instanceId is validated against the
 *      user's own instance list server-side before anything is deactivated.
 */

type LicenseRow = {
  ls_license_key_id?: string | number | null;
  key?: string | null;
  status?: string | null;
  activation_limit?: number | null;
};

async function readOwnLicense(userId: string): Promise<LicenseRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("license_keys")
    .select("ls_license_key_id,key,status,activation_limit")
    .eq("user_id", userId)
    .limit(1);
  return data && data.length > 0 ? (data[0] as LicenseRow) : null;
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

  const row = await readOwnLicense(user.id);
  if (!row || row.ls_license_key_id == null) {
    return NextResponse.json({ activationLimit: null, status: null, instances: [] });
  }

  const instances = await fetchLicenseInstances(String(row.ls_license_key_id));
  if (instances === null) {
    // LS unreachable: tell the client to show a quiet failure, not an empty list.
    return NextResponse.json({
      activationLimit: row.activation_limit ?? null,
      status: row.status ?? null,
      instances: null,
    });
  }

  return NextResponse.json({
    activationLimit: row.activation_limit ?? null,
    status: row.status ?? null,
    instances: instances.map((i) => ({
      identifier: i.identifier,
      name: i.name,
      createdAt: i.createdAt,
    })),
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

  const row = await readOwnLicense(user.id);
  if (!row || row.ls_license_key_id == null || !row.key) {
    return NextResponse.json({ error: "No license found" }, { status: 404 });
  }

  const before = await fetchLicenseInstances(String(row.ls_license_key_id));
  if (before === null) {
    return NextResponse.json({ error: "Could not reach Lemon Squeezy" }, { status: 502 });
  }
  // Ownership check: only instances that belong to this user's key can be named.
  const target = before.find((i) => i.identifier === body.instanceId);
  if (!target) {
    // Already gone (deactivated elsewhere) counts as done.
    return NextResponse.json({ ok: true, instances: before });
  }

  const deactivated = await deactivateLicenseInstance(row.key, target.identifier);

  const after = await fetchLicenseInstances(String(row.ls_license_key_id));
  const stillThere = (after ?? before).some((i) => i.identifier === target.identifier);
  if (!deactivated && stillThere) {
    return NextResponse.json({ error: "Deactivation failed. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    instances: (after ?? []).map((i) => ({
      identifier: i.identifier,
      name: i.name,
      createdAt: i.createdAt,
    })),
  });
}
