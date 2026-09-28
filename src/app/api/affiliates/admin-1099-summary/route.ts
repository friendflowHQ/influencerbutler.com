import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Year-end 1099-NEC prep: per-affiliate total of SUCCESSFUL payouts in a
 * calendar year, joined to their tax form. Flags US affiliates at or above the
 * 1099-NEC reporting threshold for that year. Does NOT reveal the full TIN
 * (only tin_last4) - use admin-tax-reveal for the actual number when filing.
 * Super-admin only; audited.
 *
 * Query: ?year=YYYY (defaults to the prior calendar year).
 */

// One Big Beautiful Bill Act (July 2025): the 1099-NEC/1099-MISC threshold
// rises from $600 to $2,000 for payments made in calendar year 2026, indexed
// for inflation in later years. Tax years 2025 and earlier keep $600.
function reportableThresholdCents(taxYear: number): number {
  return taxYear >= 2026 ? 200000 : 60000;
}

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.tax.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const yearParam = url.searchParams.get("year");
  const now = new Date();
  const year =
    yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : now.getUTCFullYear() - 1;

  const thresholdCents = reportableThresholdCents(year);

  const start = new Date(Date.UTC(year, 0, 1)).toISOString();
  const end = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const admin = createAdminClient();

  const { data: payouts, error } = await admin
    .from("affiliate_payouts")
    .select("user_id,gross_cents,paid_at")
    .eq("status", "success")
    .gte("paid_at", start)
    .lt("paid_at", end);
  if (error) {
    console.error("admin-1099-summary: query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const totalByUser = new Map<string, { totalCents: number; count: number }>();
  for (const p of payouts ?? []) {
    const uid = p.user_id as string;
    const prev = totalByUser.get(uid) ?? { totalCents: 0, count: 0 };
    prev.totalCents += (p.gross_cents as number) ?? 0;
    prev.count += 1;
    totalByUser.set(uid, prev);
  }

  const userIds = Array.from(totalByUser.keys());
  const formByUser = new Map<string, Record<string, unknown>>();
  if (userIds.length > 0) {
    const { data: forms } = await admin
      .from("affiliate_tax_forms")
      .select(
        "user_id,form_type,legal_name,business_name,country,tin_last4,tin_kind,address_line1,address_line2,city,region,postal_code,status",
      )
      .in("user_id", userIds);
    for (const f of forms ?? []) formByUser.set(f.user_id as string, f);
  }

  const affiliates = userIds
    .map((uid) => {
      const totals = totalByUser.get(uid)!;
      const form = formByUser.get(uid) ?? null;
      const country = (form?.country as string | null) ?? null;
      const isUs = country != null && /^(us|usa|united states)$/i.test(country.trim());
      return {
        userId: uid,
        totalCents: totals.totalCents,
        payoutCount: totals.count,
        legalName: (form?.legal_name as string | null) ?? null,
        businessName: (form?.business_name as string | null) ?? null,
        formType: (form?.form_type as string | null) ?? null,
        taxStatus: (form?.status as string | null) ?? "missing",
        country,
        tinLast4: (form?.tin_last4 as string | null) ?? null,
        tinKind: (form?.tin_kind as string | null) ?? null,
        address: {
          line1: (form?.address_line1 as string | null) ?? null,
          line2: (form?.address_line2 as string | null) ?? null,
          city: (form?.city as string | null) ?? null,
          region: (form?.region as string | null) ?? null,
          postalCode: (form?.postal_code as string | null) ?? null,
        },
        reportable: isUs && totals.totalCents >= thresholdCents,
      };
    })
    .sort((a, b) => b.totalCents - a.totalCents);

  await logAdminAction({
    actor,
    action: "affiliate.tax.1099_summary",
    targetType: "year",
    targetId: String(year),
    details: { affiliateCount: affiliates.length, reportable: affiliates.filter((a) => a.reportable).length },
  });

  return NextResponse.json({
    year,
    thresholdCents,
    affiliates,
  });
}
