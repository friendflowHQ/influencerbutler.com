// /api/admin/finance/filings
//
// GET ?year=  : the 1099 dataset (US table, foreign records, attention list)
//               plus payer-ready flag and last-nudged timestamps.
// PATCH       : set a filing's status/method/note (upsert on user_id+tax_year);
//               snapshots the live year total when moving to 'filed'.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance, isMigrationPendingError } from "@/lib/finance-stepup";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { load1099Data } from "@/lib/finance-1099";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveYear(url: URL): number {
  const current = new Date().getUTCFullYear();
  const y = Number(url.searchParams.get("year"));
  if (Number.isInteger(y) && y >= 2020 && y <= current + 1) return y;
  return current - 1; // default to the prior (filing) year
}

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const year = resolveYear(url);
  const today = new Date().toISOString().slice(0, 10);
  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);

  const data = await load1099Data(db, year, today);
  if ("queryFailed" in data) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  // Last-nudged map for the attention list.
  let lastNudged: Record<string, string> = {};
  try {
    const { data: cfg } = await db
      .from("app_config")
      .select("value")
      .eq("key", `finance_1099_nudge_${year}`)
      .maybeSingle();
    if (cfg?.value && typeof cfg.value === "object") {
      lastNudged = cfg.value as Record<string, string>;
    }
  } catch {
    // no nudge history yet
  }

  await logAdminAction({
    actor: gate.actor,
    action: "finance.1099.view",
    targetType: "year",
    targetId: String(year),
    details: { usCount: data.us.length, foreignCount: data.foreign.length },
  });

  return NextResponse.json({
    ok: true,
    ...data,
    payerReady: settings.payerEin.length === 9,
    payerName: settings.payerName,
    lastNudged,
  });
}

export async function PATCH(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: {
    userId?: string;
    taxYear?: number;
    status?: string;
    method?: string | null;
    note?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const taxYear = Math.round(Number(body.taxYear));
  const status = String(body.status);
  const validStatus = ["draft", "exported", "filed", "corrected", "exempt"];
  const validMethod = ["iris", "provider", "mail"];
  if (!userId || !Number.isInteger(taxYear)) {
    return NextResponse.json({ error: "Missing userId or taxYear" }, { status: 400 });
  }
  if (!validStatus.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }
  const method =
    typeof body.method === "string" && validMethod.includes(body.method) ? body.method : null;

  const db = createAdminClient();

  // Snapshot the live total when marking filed (so a later clawback flags a
  // correction).
  let amountCents: number | null | undefined = undefined;
  if (status === "filed") {
    const today = new Date().toISOString().slice(0, 10);
    const data = await load1099Data(db, taxYear, today);
    if (!("queryFailed" in data)) {
      const row = [...data.us, ...data.attention].find((r) => r.userId === userId);
      amountCents = row?.totalCents ?? null;
    }
  }

  const payload: Record<string, unknown> = {
    user_id: userId,
    tax_year: taxYear,
    status,
    method,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
    created_by: gate.actor.userId,
    updated_at: new Date().toISOString(),
  };
  if (status === "filed") {
    payload.filed_at = new Date().toISOString();
    if (amountCents !== undefined) payload.amount_cents = amountCents;
  }

  const { error } = await db
    .from("affiliate_tax_filings")
    .upsert(payload, { onConflict: "user_id,tax_year" });
  if (error) {
    if (isMigrationPendingError(error)) return NextResponse.json({ migrationPending: true });
    console.error("finance filings PATCH: upsert failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  await logAdminAction({
    actor: gate.actor,
    action: "finance.1099.status",
    targetType: "user",
    targetId: userId,
    details: { taxYear, status, method },
  });
  return NextResponse.json({ ok: true });
}
