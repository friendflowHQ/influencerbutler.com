/**
 * POST /api/admin/comps/set-months  { lsSubscriptionId, months }
 *
 * Manually set (or correct) a comp's duration when the code does not encode one
 * or parsed wrong. Stored on comp_grants with months_source='manual', which the
 * loader always prefers over the parsed value. Gated on licenses.view.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";
import { loadComps } from "@/lib/comps-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MONTHS = 36;

type Body = { lsSubscriptionId?: string; months?: number };

export async function POST(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = (body.lsSubscriptionId ?? "").trim();
  const months = Number(body.months);
  if (!id) {
    return NextResponse.json({ error: "Missing lsSubscriptionId" }, { status: 400 });
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return NextResponse.json({ error: `months must be 1-${MAX_MONTHS}` }, { status: 400 });
  }

  const svc = adminService();
  if (!svc) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { error } = await svc.from("comp_grants").upsert(
    {
      ls_subscription_id: id,
      months,
      months_source: "manual",
      updated_at: nowIso,
    },
    { onConflict: "ls_subscription_id" },
  );
  if (error) {
    console.error("comps/set-months upsert failed", error);
    return NextResponse.json({ error: "Could not save duration." }, { status: 500 });
  }

  // Recompute the row (loader prefers the manual override) and backfill the
  // grant's derived fields so the stored expiry stays meaningful.
  const result = await loadComps();
  const row = result?.rows.find((r) => r.lsSubscriptionId === id) ?? null;
  if (row) {
    await svc.from("comp_grants").upsert(
      {
        ls_subscription_id: id,
        user_id: row.userId,
        user_email: row.email,
        discount_code: row.discountCode,
        issued_at: row.issuedAt,
        expires_at: row.expiresAt,
        updated_at: nowIso,
      },
      { onConflict: "ls_subscription_id" },
    );
  }

  await logAdminAction({
    actor,
    action: "comps.set_months",
    targetType: "subscription",
    targetId: id,
    details: { months },
  });

  return NextResponse.json({ ok: true, row });
}
