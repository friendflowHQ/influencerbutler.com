// /api/admin/finance/settings
//
// GET: the finance planning settings (merged over defaults).
// PUT: patch settings (LS fee params, payout schedule, refund hold, tax mode
//      and rates, PayPal sender fee). Values are clamped sane in
//      normalizeFinanceSettings.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance } from "@/lib/finance-stepup";
import {
  loadFinanceSettings,
  saveFinanceSettings,
  type FinanceSettings,
} from "@/lib/finance-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireFinance("finance.view", request);
  if (!gate.ok) return gate.response;
  const db = createAdminClient();
  return NextResponse.json({ ok: true, settings: await loadFinanceSettings(db) });
}

export async function PUT(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: Partial<FinanceSettings>;
  try {
    body = (await request.json()) as Partial<FinanceSettings>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const db = createAdminClient();
  try {
    const settings = await saveFinanceSettings(db, body, gate.actor.email);
    await logAdminAction({
      actor: gate.actor,
      action: "finance.settings.update",
      targetType: "app_config",
      targetId: "finance",
      details: body as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true, settings });
  } catch (error) {
    console.error("finance settings: save failed", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}
