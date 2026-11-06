// POST /api/admin/finance/commission/backfill
//
// One-time (safe to re-run) fill of the Foyer commission ledger from sales
// made before the ledger existed. Each call handles up to 100 payments and
// reports how many are left.

import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance-stepup";
import { callLinksAdmin } from "@/lib/links-admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;
  const res = await callLinksAdmin("/admin/commerce/backfill-ledger", { method: "POST", body: { limit: 100 } });
  await logAdminAction({ actor: gate.actor, action: "foyer.ledger_backfill", details: res.ok ? (res.data as Record<string, unknown>) : { error: res.error } });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: 502 });
  return NextResponse.json({ ok: true, ...(res.data as object) });
}
