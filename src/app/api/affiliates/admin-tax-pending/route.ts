import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { loadPendingTaxForms } from "@/lib/tax-review-pending";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/affiliates/admin-tax-pending
 *
 * Tax forms awaiting review (status 'submitted'), for the admin dashboard Tasks
 * card and the per-affiliate review action bar (?userId= narrows to one
 * affiliate). Gated on the stricter tax permission - this deliberately is NOT
 * part of admin-roster, which any affiliates.view admin can read. Money columns
 * are best-effort: a commission-engine failure degrades to nulls rather than
 * hiding the review task.
 */
export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.tax.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const userIdFilter = new URL(request.url).searchParams.get("userId")?.trim() || null;

  let pending = await loadPendingTaxForms();
  if (userIdFilter) {
    pending = pending.filter((p) => p.userId === userIdFilter);
  }

  const money = new Map<string, { payableCents: number; owedCents: number }>();
  if (pending.length > 0) {
    try {
      const result = await loadAffiliateCommissions({ userIds: pending.map((p) => p.userId) });
      for (const s of result?.statements ?? []) {
        money.set(s.userId, {
          payableCents: s.payableCents,
          owedCents: s.owedCents + s.adjustmentCents,
        });
      }
    } catch (error) {
      console.error("admin-tax-pending: commissions load failed", error);
    }
  }

  return NextResponse.json({
    pending: pending.map((p) => ({
      ...p,
      payableCents: money.get(p.userId)?.payableCents ?? null,
      owedCents: money.get(p.userId)?.owedCents ?? null,
    })),
  });
}
