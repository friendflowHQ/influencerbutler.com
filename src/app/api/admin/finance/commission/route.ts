// GET /api/admin/finance/commission?from&to&bucket=day|week|month
//
// Influencer Butler's commission (the 5% Stripe application fee) on creators'
// Foyer sales: totals vs the previous period, a chart series, and the
// per-creator rollup. Data lives in the links Worker's commerce ledger.

import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance-stepup";
import { callLinksAdmin, pickQuery } from "@/lib/links-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const query = pickQuery(request, ["from", "to", "bucket"]);
  const [summary, creators] = await Promise.all([
    callLinksAdmin("/admin/commerce/summary", { query }),
    callLinksAdmin("/admin/commerce/creators", { query }),
  ]);
  if (!summary.ok) return NextResponse.json({ error: summary.error }, { status: summary.status === 503 ? 503 : 502 });
  return NextResponse.json({
    ok: true,
    ...(summary.data as object),
    creators: creators.ok ? (creators.data as { creators?: unknown[] }).creators ?? [] : [],
  });
}
