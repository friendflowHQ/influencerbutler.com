// GET /api/admin/stores/:owner?from&to
//
// One creator's store for the admin Creator stores page: every product and
// membership with its sales, Stripe fees, our fee and their net, plus
// newsletter counts by status and source and 90-day growth (counts only),
// and their website account.

import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance-stepup";
import { callLinksAdmin, pickQuery } from "@/lib/links-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountsForOwners } from "@/lib/creator-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OWNER_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function GET(request: Request, { params }: { params: Promise<{ owner: string }> }) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const { owner } = await params;
  if (!OWNER_RE.test(owner)) return NextResponse.json({ error: "Invalid creator" }, { status: 400 });

  const res = await callLinksAdmin(`/admin/commerce/stores/${owner}`, { query: pickQuery(request, ["from", "to"]) });
  if (!res.ok) {
    const status = res.status === 404 ? 404 : res.status === 503 ? 503 : 502;
    return NextResponse.json({ error: res.status === 404 ? "No store found for this creator." : res.error }, { status });
  }
  const accounts = await accountsForOwners(createAdminClient(), [owner]).catch(() => ({}) as Record<string, unknown>);
  return NextResponse.json({ ok: true, ...(res.data as object), account: (accounts as Record<string, unknown>)[owner] ?? null });
}
