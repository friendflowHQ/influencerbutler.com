import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/affiliates/payout-history
 *
 * The signed-in affiliate's own payout ledger (most recent first), for the
 * dashboard's payout history table, CSV download and tax-year summary.
 * Never exposes error notes or PayPal batch internals.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createAdminClient();
  try {
    const { data: rows, error } = await admin
      .from("affiliate_payouts")
      .select("id,period,gross_cents,currency,status,paypal_email,created_at,paid_at")
      .eq("user_id", userData.user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const payouts = (rows ?? []).map((r) => ({
      id: r.id as string,
      period: (r.period as string | null) ?? null,
      amountCents: (r.gross_cents as number) ?? 0,
      currency: (r.currency as string | null) ?? "USD",
      status: r.status as string,
      paypalEmail: (r.paypal_email as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      paidAt: (r.paid_at as string | null) ?? null,
    }));
    return NextResponse.json({ payouts });
  } catch (err) {
    // The ledger table may lag in environments where migrations are hand-applied.
    console.warn("payout-history: ledger read skipped", err);
    return NextResponse.json({ payouts: [], migrationPending: true });
  }
}
