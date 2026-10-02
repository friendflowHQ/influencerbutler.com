// POST /api/admin/finance/valuation/recompute
//
// Manual "Recompute now" button on the Valuation tab, for refreshing between
// the Monday routine's scheduled runs. finance.manage (stricter than the view
// permission every other finance route uses) since this writes data.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireFinance } from "@/lib/finance-stepup";
import { computeValuationSnapshot, upsertValuationSnapshot } from "@/lib/valuation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  const db = createAdminClient();
  const snapshot = await computeValuationSnapshot(db, new Date());
  if (!snapshot) {
    return NextResponse.json({ error: "Compute failed" }, { status: 500 });
  }

  const written = await upsertValuationSnapshot(db, snapshot);
  if (!written.ok) {
    if (written.errorCode === "42P01" || written.errorCode === "42703") {
      return NextResponse.json({ migrationPending: true });
    }
    return NextResponse.json({ error: written.error ?? "Write failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, snapshot });
}
