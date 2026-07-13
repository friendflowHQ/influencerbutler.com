import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Self-hosted affiliate dashboard data. Replaces the Lemon-Squeezy-powered
 * /api/affiliates/me: everything here is sourced from our own tables.
 *  - owed / gross / orderCount / rate: the commission engine (single source of truth)
 *  - paidCents: sum of successful rows in the affiliate_payouts ledger
 *  - taxStatus / paypalEmail: the "get paid" checklist gates
 *
 * Reads of the payout/tax tables are wrapped so an environment where the
 * migrations haven't been applied yet degrades gracefully instead of 500ing.
 */

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = userData.user;

    const admin = createAdminClient();

    const { data: profile, error: profileErr } = await admin
      .from("profiles")
      .select("is_affiliate,affiliate_code,paypal_email,created_at")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("me-selfhosted: profile query failed", profileErr);
      return NextResponse.json({ error: "Could not load affiliate" }, { status: 500 });
    }
    if (!profile || profile.is_affiliate !== true) {
      return NextResponse.json({ error: "Not an affiliate" }, { status: 403 });
    }

    // Owed / gross / count from the commission engine.
    const commissions = await loadAffiliateCommissions({ userIds: [user.id] });
    const stmt = commissions?.statements.find((row) => row.userId === user.id) ?? null;

    // Paid-to-date from the ledger (successful payouts only).
    let paidCents = 0;
    try {
      const { data: payouts } = await admin
        .from("affiliate_payouts")
        .select("gross_cents,status")
        .eq("user_id", user.id)
        .eq("status", "success");
      for (const p of payouts ?? []) {
        if (typeof p.gross_cents === "number") paidCents += p.gross_cents;
      }
    } catch (err) {
      console.warn("me-selfhosted: payouts read skipped", err);
    }

    // Comp allowance gate. Read separately + wrapped so a not-yet-migrated
    // affiliate_comp_monthly_quota column degrades to "disabled" instead of
    // 500ing the whole dashboard (prod schema is applied by hand and drifts).
    let compEnabled = false;
    try {
      const { data: comp } = await admin
        .from("profiles")
        .select("affiliate_comp_monthly_quota")
        .eq("id", user.id)
        .maybeSingle();
      compEnabled =
        typeof comp?.affiliate_comp_monthly_quota === "number" &&
        comp.affiliate_comp_monthly_quota > 0;
    } catch (err) {
      console.warn("me-selfhosted: comp allowance read skipped", err);
    }

    // Tax form status for the checklist.
    let taxStatus = "not_submitted";
    let taxFormType: string | null = null;
    try {
      const { data: tax } = await admin
        .from("affiliate_tax_forms")
        .select("status,form_type")
        .eq("user_id", user.id)
        .maybeSingle();
      if (tax?.status) taxStatus = tax.status as string;
      if (tax?.form_type) taxFormType = tax.form_type as string;
    } catch (err) {
      console.warn("me-selfhosted: tax read skipped", err);
    }

    return NextResponse.json({
      brandedCode: (profile.affiliate_code as string | null) ?? null,
      createdAt: (profile.created_at as string | null) ?? null,
      owedCents: stmt?.owedCents ?? 0,
      grossCents: stmt?.grossCents ?? 0,
      orderCount: stmt?.orderCount ?? 0,
      ratePercent: stmt?.ratePercent ?? 30,
      // null = lifetime (custom deals like Samantha); a number = capped window.
      // When there's no statement yet, a default affiliate is capped at 12 months.
      durationMonths: stmt ? stmt.durationMonths : 12,
      paidCents,
      paypalEmail: (profile.paypal_email as string | null) ?? null,
      taxStatus,
      taxFormType,
      // Comp allowance gate: whether this affiliate may hand out free workspaces.
      // The card fetches /api/affiliates/comps for the quota, usage, and history.
      comp: { enabled: compEnabled },
    });
  } catch (err) {
    console.error("me-selfhosted error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
