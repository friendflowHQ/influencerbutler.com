import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { updateDiscountDuration } from "@/lib/lemonsqueezy-discounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-time admin backfill: converts every already-minted affiliate branded
 * discount from the old one-time (`duration: "once"`) behavior to recurring
 * (`duration: "forever"`), so existing codes (e.g. LIZ2) give the referred
 * customer 15% off every month for as long as they stay subscribed, matching
 * newly minted codes.
 *
 * Targets discounts precisely by the LS id stored on each affiliate profile
 * (profiles.ls_affiliate_discount_id, set at approval in affiliates-approve.ts).
 * Idempotent: PATCHing a discount that is already "forever" is a no-op, so this
 * is safe to re-run.
 */

type BackfillClient = {
  from: (table: string) => {
    select: (cols: string) => {
      not: (
        col: string,
        op: string,
        value: null,
      ) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
    };
  };
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.codes.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as BackfillClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id,ls_affiliate_discount_id")
    .not("ls_affiliate_discount_id", "is", null);

  if (error) {
    console.error("admin-backfill-discount-duration: profile query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];
  const discountIds = rows
    .map((r) => (typeof r.ls_affiliate_discount_id === "string" ? r.ls_affiliate_discount_id : ""))
    .filter((id) => id.length > 0);

  let updated = 0;
  const failedIds: string[] = [];
  for (const discountId of discountIds) {
    const result = await updateDiscountDuration(discountId, "forever");
    if (result.ok) {
      updated += 1;
    } else {
      failedIds.push(discountId);
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.code.backfill_duration",
    targetType: "system",
    targetId: "affiliate-branded-discounts",
    details: { total: discountIds.length, updated, failed: failedIds.length },
  });

  return NextResponse.json({
    ok: true,
    total: discountIds.length,
    updated,
    failed: failedIds.length,
    failedIds,
  });
}
