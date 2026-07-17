/**
 * POST /api/affiliates/admin-attribute-order
 *
 * Retroactively attribute a paid order (or all of a customer's un-attributed
 * paid orders) to an affiliate. This is the backstop for when a customer bought
 * WITHOUT clicking the affiliate's link, so the order_created webhook captured no
 * referral: an admin stamps ref_affiliate_user_id / ref_affiliate_code and marks
 * it attribution_status='pending', which is exactly what the owed report and the
 * PayPal disburse path read to credit and pay the affiliate.
 *
 * Guarded: it never overwrites an order that is ALREADY attributed to a
 * different affiliate unless `force` is set, so a manual fix cannot silently
 * steal a commission that was correctly captured at checkout.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { resolveAdminAffiliate, escapeLike, asQueryClient } from "@/lib/affiliate-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  affiliate?: unknown; // affiliate branded code OR user id
  orderId?: unknown; // a specific ls_order_id
  recipientEmail?: unknown; // OR: stamp all of this customer's un-attributed paid orders
  force?: unknown; // overwrite an order already attributed to a DIFFERENT affiliate
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

type OrderRow = {
  ls_order_id: string;
  user_id: string | null;
  status: string | null;
  attribution_status: string | null;
  ref_affiliate_user_id: string | null;
  reconciled_at: string | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.link", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const affiliateInput = str(body.affiliate);
  if (!affiliateInput) {
    return NextResponse.json({ error: "Choose an affiliate (code or user id)." }, { status: 400 });
  }
  const orderId = str(body.orderId);
  const recipientEmail = str(body.recipientEmail);
  const force = body.force === true;
  if (!orderId && !recipientEmail) {
    return NextResponse.json(
      { error: "Provide an order id or a customer email to attribute." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const admin = asQueryClient(adminClient);

  const aff = await resolveAdminAffiliate(adminClient, affiliateInput);
  if (!aff) {
    return NextResponse.json(
      { error: "No affiliate found for that code or user id." },
      { status: 404 },
    );
  }

  // Gather the candidate orders.
  let candidates: OrderRow[] = [];
  if (orderId) {
    const { data, error } = await admin
      .from("orders")
      .select("ls_order_id,user_id,status,attribution_status,ref_affiliate_user_id,reconciled_at")
      .eq("ls_order_id", orderId)
      .limit(1);
    if (error) {
      console.error("admin-attribute-order: order fetch failed", error);
      return NextResponse.json({ error: "Order lookup failed." }, { status: 500 });
    }
    candidates = (data ?? []) as OrderRow[];
    if (candidates.length === 0) {
      return NextResponse.json({ error: `No order found with id ${orderId}.` }, { status: 404 });
    }
  } else if (recipientEmail) {
    // Resolve the customer's user id, then their paid orders.
    const { data: prof, error: profErr } = await admin
      .from("profiles")
      .select("id")
      .ilike("email", escapeLike(recipientEmail))
      .limit(1);
    if (profErr) {
      console.error("admin-attribute-order: customer lookup failed", profErr);
      return NextResponse.json({ error: "Customer lookup failed." }, { status: 500 });
    }
    const customerId = Array.isArray(prof) && prof[0]?.id ? (prof[0].id as string) : null;
    if (!customerId) {
      return NextResponse.json(
        { error: `No account found for ${recipientEmail}.` },
        { status: 404 },
      );
    }
    const { data, error } = await admin
      .from("orders")
      .select("ls_order_id,user_id,status,attribution_status,ref_affiliate_user_id,reconciled_at")
      .eq("user_id", customerId);
    if (error) {
      console.error("admin-attribute-order: orders fetch failed", error);
      return NextResponse.json({ error: "Orders lookup failed." }, { status: 500 });
    }
    candidates = ((data ?? []) as OrderRow[]).filter((o) => o.status === "paid");
    if (candidates.length === 0) {
      return NextResponse.json(
        { error: `${recipientEmail} has no paid orders to attribute yet.` },
        { status: 404 },
      );
    }
  }

  const stamped: string[] = [];
  const skipped: { orderId: string; reason: string }[] = [];

  for (const o of candidates) {
    const existing = str(o.ref_affiliate_user_id);
    if (existing && existing === aff.userId) {
      skipped.push({ orderId: o.ls_order_id, reason: "already attributed to this affiliate" });
      continue;
    }
    if (existing && existing !== aff.userId && !force) {
      skipped.push({
        orderId: o.ls_order_id,
        reason: "already attributed to a different affiliate (use force to override)",
      });
      continue;
    }
    const { error } = await admin
      .from("orders")
      .update({
        ref_affiliate_user_id: aff.userId,
        ref_affiliate_code: aff.code,
        attribution_status: "pending",
      })
      .eq("ls_order_id", o.ls_order_id);
    if (error) {
      console.error("admin-attribute-order: update failed", o.ls_order_id, error);
      skipped.push({ orderId: o.ls_order_id, reason: "update failed" });
      continue;
    }
    stamped.push(o.ls_order_id);
  }

  await logAdminAction({
    actor,
    action: "affiliate.order.attribute",
    targetType: "user",
    targetId: aff.userId,
    details: {
      affiliateCode: aff.code,
      recipientEmail,
      requestedOrderId: orderId,
      force,
      stamped,
      skipped,
    },
  });

  return NextResponse.json({
    ok: stamped.length > 0,
    affiliateCode: aff.code,
    affiliateName: aff.displayName,
    stampedCount: stamped.length,
    stamped,
    skipped,
  });
}
