// GET /api/admin/finance/commission/sales?from&to&owner&q&status&before
//
// The Foyer payments behind the commission numbers, newest first: buyer,
// item, amount, fees and refund state. Filter by creator (owner) or search a
// buyer's email / name or an item title.

import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance-stepup";
import { callLinksAdmin, pickQuery } from "@/lib/links-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const res = await callLinksAdmin("/admin/commerce/sales", {
    query: pickQuery(request, ["from", "to", "owner", "q", "status", "before", "limit"]),
  });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status === 400 ? 400 : 502 });
  return NextResponse.json({ ok: true, ...(res.data as object) });
}
