// POST /api/admin/finance/backfill-orders?dry=1
//
// Pages through Lemon Squeezy /orders and back-fills the finance enrichment
// columns (subtotal/tax/total/refund, USD cents) onto existing orders rows.
// The webhook captures these going forward; this catches everything from
// before the finance migration. ?dry=1 previews counts without writing.
// LS rate limit is ~300 req/min; we page 100 at a time with a small delay.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance, isMigrationPendingError } from "@/lib/finance-stepup";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type LsOrderAttributes = {
  status?: string | null;
  currency?: string | null;
  subtotal?: number;
  tax?: number;
  total?: number;
  refunded_amount?: number;
  subtotal_usd?: number;
  tax_usd?: number;
  total_usd?: number;
  refunded_amount_usd?: number;
  refunded_at?: string | null;
};

type LsOrder = { id?: string; attributes?: LsOrderAttributes };

function centsFrom(a: LsOrderAttributes, usd: number | undefined, raw: number | undefined): number | null {
  const currency = (a.currency ?? "").toUpperCase();
  const pick = typeof usd === "number" ? usd : currency === "USD" ? raw : undefined;
  return typeof pick === "number" && Number.isFinite(pick) ? Math.round(pick) : null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const db = createAdminClient();

  // Which orders exist locally (only those get updated).
  const localIds = new Set<string>();
  for (let page = 0; page < 50; page++) {
    const { data, error } = await db
      .from("orders")
      .select("ls_order_id")
      .range(page * 1000, page * 1000 + 999);
    if (error) {
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    const batch = data ?? [];
    for (const r of batch) localIds.add(r.ls_order_id as string);
    if (batch.length < 1000) break;
  }

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  const samples: Record<string, unknown>[] = [];

  for (let page = 1; page <= 100; page++) {
    const res = await lsApi(`/orders?page[size]=100&page[number]=${page}`, { method: "GET" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("finance backfill: LS orders fetch failed", {
        page,
        status: res.status,
        text: text.slice(0, 300),
      });
      return NextResponse.json(
        { error: `Lemon Squeezy fetch failed (page ${page}, status ${res.status})` },
        { status: 502 },
      );
    }
    const payload = (await res.json()) as {
      data?: LsOrder[];
      meta?: { page?: { last_page?: number } };
    };
    const orders = payload.data ?? [];
    scanned += orders.length;

    for (const order of orders) {
      if (!order.id || !localIds.has(order.id)) continue;
      matched++;
      const a = order.attributes ?? {};
      const update: Record<string, unknown> = {};
      const subtotal = centsFrom(a, a.subtotal_usd, a.subtotal);
      const tax = centsFrom(a, a.tax_usd, a.tax);
      const total = centsFrom(a, a.total_usd, a.total);
      const refunded = centsFrom(a, a.refunded_amount_usd, a.refunded_amount);
      if (subtotal !== null) update.subtotal_usd_cents = subtotal;
      if (tax !== null) update.tax_usd_cents = tax;
      if (total !== null) update.total_usd_cents = total;
      if (refunded !== null) update.refunded_usd_cents = refunded;
      if (typeof a.refunded_at === "string" && a.refunded_at) update.refunded_at = a.refunded_at;
      if (Object.keys(update).length === 0) continue;

      if (samples.length < 5) samples.push({ lsOrderId: order.id, ...update });
      if (dry) {
        updated++;
        continue;
      }
      const { error } = await db.from("orders").update(update).eq("ls_order_id", order.id);
      if (error) {
        if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
        console.error("finance backfill: order update failed", error, { lsOrderId: order.id });
        continue;
      }
      updated++;
    }

    const lastPage = payload.meta?.page?.last_page;
    if (orders.length === 0 || (lastPage != null && page >= lastPage)) break;
    await sleep(250);
  }

  if (!dry) {
    await logAdminAction({
      actor: gate.actor,
      action: "finance.backfill_orders",
      targetType: "orders",
      targetId: "all",
      details: { scanned, matched, updated },
    });
  }

  return NextResponse.json({ ok: true, dry, scanned, matched, updated, samples });
}
