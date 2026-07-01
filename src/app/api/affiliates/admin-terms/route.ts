import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Set a custom commission rate + duration for one affiliate.
 *
 * commissionPercent          the affiliate's total promised rate (0..100). We
 *                            top up the gap between this and what LS actually
 *                            paid (see src/lib/affiliate-commissions.ts).
 * commissionDurationMonths   how long we honor the elevated rate, counted from
 *                            each referred customer's first order. null =
 *                            lifetime (never expires); a positive integer honors
 *                            it for that many months.
 *
 * Pass commissionPercent null to clear the custom rate (falls back to 30%).
 */

type TermsClient = {
  from: (table: string) => {
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
  };
};

type TermsBody = {
  userId?: string;
  commissionPercent?: number | null;
  commissionDurationMonths?: number | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.terms.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: TermsBody;
  try {
    body = (await request.json()) as TermsBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  // Percent: null clears the custom rate; otherwise must be an integer 0..100.
  let commissionPercent: number | null = null;
  if (body.commissionPercent !== null && body.commissionPercent !== undefined) {
    const p = Math.round(Number(body.commissionPercent));
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return NextResponse.json({ error: "commissionPercent must be 0-100" }, { status: 400 });
    }
    commissionPercent = p;
  }

  // Duration: null = lifetime; otherwise a positive integer number of months.
  let commissionDurationMonths: number | null = null;
  if (body.commissionDurationMonths !== null && body.commissionDurationMonths !== undefined) {
    const m = Math.round(Number(body.commissionDurationMonths));
    if (!Number.isFinite(m) || m <= 0) {
      return NextResponse.json(
        { error: "commissionDurationMonths must be a positive number or null" },
        { status: 400 },
      );
    }
    commissionDurationMonths = m;
  }

  const supabase = createAdminClient() as unknown as TermsClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      commission_percent: commissionPercent,
      commission_duration_months: commissionDurationMonths,
      commission_terms_updated_at: new Date().toISOString(),
      commission_terms_updated_by: actor.email,
    })
    .eq("id", userId);

  if (error) {
    console.error("admin-terms: update failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "affiliate.commission.terms",
    targetType: "user",
    targetId: userId,
    details: { commissionPercent, commissionDurationMonths },
  });

  return NextResponse.json({ ok: true, commissionPercent, commissionDurationMonths });
}
