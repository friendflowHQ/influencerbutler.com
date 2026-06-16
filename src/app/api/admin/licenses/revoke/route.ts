import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { lsLicenseKeyId?: string; reactivate?: boolean };

/**
 * Marks a license key revoked (or reactivates it) in our database. This is the
 * local status flip used by the desktop license check; the Lemon Squeezy-side
 * license record is not mutated here. Gated by licenses.revoke and audited.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("licenses.revoke", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.lsLicenseKeyId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "Missing lsLicenseKeyId" }, { status: 400 });
  }
  const nextStatus = body.reactivate === true ? "active" : "revoked";

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await svc
    .from("license_keys")
    .update({ status: nextStatus })
    .eq("ls_license_key_id", id);
  if (error) {
    console.error("licenses/revoke update failed", error);
    return NextResponse.json({ error: "Could not update license." }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: nextStatus === "revoked" ? "licenses.revoke" : "licenses.reactivate",
    targetType: "license",
    targetId: id,
    details: { status: nextStatus },
  });

  return NextResponse.json({ ok: true, status: nextStatus });
}
