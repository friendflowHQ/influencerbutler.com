import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin "view as affiliate" data source. Returns the SAME payload shape as
 * /api/affiliates/me-selfhosted, but for an arbitrary affiliate identified by
 * ?userId=, gated behind the affiliates.view permission instead of the caller's
 * own session. Powers the read-only dashboard at
 * /dashboard/admin/affiliates/[userId].
 *
 * Full tax details (legal name, country, TIN last-4) are included only when the
 * actor also holds affiliates.tax.view; otherwise only the status/type degrade
 * that me-selfhosted already exposes is returned. The full TIN is never returned.
 */

export async function GET(request: Request) {
  try {
    const actor = await requirePermission("affiliates.view", request);
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_affiliate,affiliate_code,paypal_email,created_at")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr) {
      console.error("admin-affiliate-view: profile query failed", profileErr);
      return NextResponse.json({ error: "Could not load affiliate" }, { status: 500 });
    }
    if (!profile || profile.is_affiliate !== true) {
      return NextResponse.json({ error: "Not an affiliate" }, { status: 404 });
    }

    // Display name for the dashboard header: prefer the application's full name.
    let displayName: string | null = null;
    try {
      const { data: app } = await admin
        .from("affiliate_applications")
        .select("full_name")
        .eq("user_id", userId)
        .maybeSingle();
      if (typeof app?.full_name === "string") displayName = app.full_name;
    } catch (err) {
      console.warn("admin-affiliate-view: application name read skipped", err);
    }

    // Owed / gross / count / rate / duration from the commission engine.
    const commissions = await loadAffiliateCommissions({ userIds: [userId] });
    const stmt = commissions?.statements.find((row) => row.userId === userId) ?? null;

    // Paid-to-date from the ledger (successful payouts only).
    let paidCents = 0;
    try {
      const { data: payouts } = await admin
        .from("affiliate_payouts")
        .select("gross_cents,status")
        .eq("user_id", userId)
        .eq("status", "success");
      for (const p of payouts ?? []) {
        if (typeof p.gross_cents === "number") paidCents += p.gross_cents;
      }
    } catch (err) {
      console.warn("admin-affiliate-view: payouts read skipped", err);
    }

    // Whether this actor may see the affiliate's full tax details (PII).
    const canSeeTax = actor.role === "admin" || actor.permissions.has("affiliates.tax.view");

    // Tax form: always the status/type (matching me-selfhosted); full details
    // (legal name, country, TIN last-4) only for actors with affiliates.tax.view.
    let taxStatus = "not_submitted";
    let taxFormType: string | null = null;
    let taxForm: {
      legalName: string | null;
      country: string | null;
      tinLast4: string | null;
      tinKind: string | null;
      formType: string | null;
      status: string | null;
      submittedAt: string | null;
      verifiedAt: string | null;
      rejectedReason: string | null;
    } | null = null;
    try {
      const { data: tax } = await admin
        .from("affiliate_tax_forms")
        .select(
          "form_type,legal_name,country,tin_last4,tin_kind,status,submitted_at,verified_at,rejected_reason",
        )
        .eq("user_id", userId)
        .maybeSingle();
      if (tax?.status) taxStatus = tax.status as string;
      if (tax?.form_type) taxFormType = tax.form_type as string;
      if (tax && canSeeTax) {
        taxForm = {
          legalName: (tax.legal_name as string | null) ?? null,
          country: (tax.country as string | null) ?? null,
          tinLast4: (tax.tin_last4 as string | null) ?? null,
          tinKind: (tax.tin_kind as string | null) ?? null,
          formType: (tax.form_type as string | null) ?? null,
          status: (tax.status as string | null) ?? null,
          submittedAt: (tax.submitted_at as string | null) ?? null,
          verifiedAt: (tax.verified_at as string | null) ?? null,
          rejectedReason: (tax.rejected_reason as string | null) ?? null,
        };
      }
    } catch (err) {
      console.warn("admin-affiliate-view: tax read skipped", err);
    }

    return NextResponse.json({
      brandedCode: (profile.affiliate_code as string | null) ?? null,
      createdAt: (profile.created_at as string | null) ?? null,
      displayName,
      owedCents: stmt?.owedCents ?? 0,
      grossCents: stmt?.grossCents ?? 0,
      orderCount: stmt?.orderCount ?? 0,
      ratePercent: stmt?.ratePercent ?? 30,
      durationMonths: stmt ? stmt.durationMonths : 12,
      paidCents,
      paypalEmail: (profile.paypal_email as string | null) ?? null,
      taxStatus,
      taxFormType,
      taxForm,
    });
  } catch (err) {
    console.error("admin-affiliate-view error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
