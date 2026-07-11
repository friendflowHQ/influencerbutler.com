import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { disburseAffiliate } from "@/lib/paypal-payouts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate payout ledger.
 *
 * GET  -> recent payout rows (most recent first) with the affiliate's display
 *         name, for the Payouts-tab history view.
 * POST -> retry a previously FAILED / RETURNED / DENIED / BLOCKED / UNCLAIMED
 *         payout. Creates a fresh PayPal batch (new sender_batch_id) for the
 *         still-owed amount; the original failed row is kept for history and
 *         marked superseded. No money moved on the failed row, so this is safe.
 */

const RETRYABLE = new Set(["failed", "returned", "denied", "blocked", "unclaimed"]);

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from("affiliate_payouts")
    .select(
      "id,user_id,period,gross_cents,currency,status,paypal_email,paypal_batch_id,error_note,created_at,paid_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("admin-payouts-ledger GET: query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const userIds = Array.from(new Set((rows ?? []).map((r) => r.user_id as string)));
  const nameByUser = new Map<string, string>();
  const emailByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const [{ data: forms }, { data: apps }, { data: profiles }] = await Promise.all([
      admin.from("affiliate_tax_forms").select("user_id,legal_name").in("user_id", userIds),
      admin.from("affiliate_applications").select("user_id,full_name").in("user_id", userIds),
      admin.from("profiles").select("id,email").in("id", userIds),
    ]);
    for (const p of profiles ?? []) if (p.email) emailByUser.set(p.id as string, p.email as string);
    for (const a of apps ?? []) if (a.full_name) nameByUser.set(a.user_id as string, a.full_name as string);
    // legal_name wins over application name.
    for (const f of forms ?? []) if (f.legal_name) nameByUser.set(f.user_id as string, f.legal_name as string);
  }

  const payouts = (rows ?? []).map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    name: nameByUser.get(r.user_id as string) ?? emailByUser.get(r.user_id as string) ?? null,
    email: emailByUser.get(r.user_id as string) ?? null,
    period: (r.period as string | null) ?? null,
    grossCents: (r.gross_cents as number) ?? 0,
    currency: (r.currency as string | null) ?? "USD",
    status: r.status as string,
    paypalEmail: (r.paypal_email as string | null) ?? null,
    errorNote: (r.error_note as string | null) ?? null,
    createdAt: (r.created_at as string | null) ?? null,
    paidAt: (r.paid_at as string | null) ?? null,
    retryable: RETRYABLE.has(r.status as string),
  }));

  return NextResponse.json({ payouts });
}

type RetryBody = { payoutId?: string };

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.payout", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: RetryBody;
  try {
    body = (await request.json()) as RetryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const payoutId = body.payoutId?.trim();
  if (!payoutId) {
    return NextResponse.json({ error: "Missing payoutId" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: old, error: loadErr } = await admin
    .from("affiliate_payouts")
    .select("id,user_id,period,status")
    .eq("id", payoutId)
    .maybeSingle();

  if (loadErr || !old) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }
  if (!RETRYABLE.has(old.status as string)) {
    return NextResponse.json(
      { error: `Only a failed payout can be retried (this one is '${old.status}').` },
      { status: 409 },
    );
  }

  // Fresh sender_batch_id suffix so PayPal accepts a new batch and the old failed
  // row is preserved. Date-based; this is a route (not a workflow), so Date is ok.
  const retrySuffix = Date.now().toString(36);
  const outcome = await disburseAffiliate({
    admin,
    actorEmail: actor.email,
    userId: old.user_id as string,
    period: (old.period as string | null) ?? null,
    retrySuffix,
  });

  if (!outcome.ok) {
    await logAdminAction({
      actor,
      action: "affiliate.commission.payout.retry.error",
      targetType: "user",
      targetId: old.user_id as string,
      details: { originalPayoutId: payoutId, code: outcome.code ?? null },
    });
    return NextResponse.json(
      { ok: false, error: outcome.error, code: outcome.code },
      { status: outcome.httpStatus },
    );
  }

  // Mark the original row superseded (kept for history).
  await admin
    .from("affiliate_payouts")
    .update({ error_note: `Superseded by retry ${outcome.payoutId}`, updated_at: new Date().toISOString() })
    .eq("id", payoutId);

  await logAdminAction({
    actor,
    action: "affiliate.commission.payout.retry",
    targetType: "user",
    targetId: old.user_id as string,
    details: { originalPayoutId: payoutId, newPayoutId: outcome.payoutId, grossCents: outcome.grossCents },
  });

  return NextResponse.json({
    ok: true,
    payoutId: outcome.payoutId,
    payoutBatchId: outcome.payoutBatchId,
    grossCents: outcome.grossCents,
    status: "processing",
  });
}
