// GET /api/admin/stores?from&to&q&sort
//
// Admin Creator stores list: every creator with Foyer products, memberships,
// a Stripe account or newsletter subscribers, with products, sales (gross,
// Stripe fees, our fee, their net, refunds) and newsletter counts. Data comes
// from the links Worker; each creator is matched to their website account
// (name, email, plan). A search also matches website names and emails.

import { NextResponse } from "next/server";
import { requireFinance } from "@/lib/finance-stepup";
import { callLinksAdmin, pickQuery } from "@/lib/links-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { accountsForOwners, ownersMatchingAccount } from "@/lib/creator-stores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Store = { owner: string };

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const query = pickQuery(request, ["from", "to", "q", "sort", "limit"]);
  const db = createAdminClient();
  if (query.q) {
    const owners = await ownersMatchingAccount(db, query.q).catch(() => []);
    if (owners.length) query.owners = owners.join(",");
  }

  const res = await callLinksAdmin<{ stores?: Store[] }>("/admin/commerce/stores", { query });
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status === 503 ? 503 : 502 });

  const stores = res.data.stores ?? [];
  const accounts = await accountsForOwners(
    db,
    stores.map((s) => s.owner),
  ).catch(() => ({}));
  return NextResponse.json({ ok: true, ...res.data, accounts });
}
