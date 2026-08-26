// GET /api/cron/finance-tax-reminder
//
// Daily (15:00 UTC = 9am MDT / 8am MST): when today is 7 days or 1 day before
// a quarterly estimated-tax deadline (America/Denver wall clock), email the
// owner the recommended set-aside for that quarter. Idempotent per
// deadline+offset via an app_config marker. ?dry=1 previews without sending;
// ?force=1 skips the date gate (treats today as 7 days out). Gated on
// CRON_SECRET like the other crons.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localParts, DEFAULT_DIGEST_TIMEZONE } from "@/lib/daily-digest";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { loadFinanceOrders } from "@/lib/finance-orders-data";
import { buildPnl } from "@/lib/finance-report";
import { nextDeadline, daysUntil, computeTaxSetAside } from "@/lib/finance-tax";
import { sendTaxReminder, buildTaxReminderBody } from "@/lib/finance-tax-reminder-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMINDER_OFFSETS = [7, 1];

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("finance-tax-reminder cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

async function alreadyRan(markerKey: string): Promise<boolean> {
  const db = createAdminClient();
  try {
    const { data } = await db.from("app_config").select("value").eq("key", markerKey).maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function markRan(markerKey: string, summary: Record<string, unknown>): Promise<void> {
  const db = createAdminClient();
  await db.from("app_config").upsert(
    {
      key: markerKey,
      value: { ran_at: new Date().toISOString(), ...summary },
      updated_at: new Date().toISOString(),
      updated_by: "cron:finance-tax-reminder",
    },
    { onConflict: "key" },
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const dry = params.get("dry") === "1";
  const force = params.get("force") === "1";

  const parts = localParts(new Date(), DEFAULT_DIGEST_TIMEZONE);
  const today = `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;

  const { quarter } = nextDeadline(today);
  const daysOut = daysUntil(today, quarter.dueDate);
  if (!force && !REMINDER_OFFSETS.includes(daysOut)) {
    return NextResponse.json({ ok: true, ran: false, reason: "not-a-reminder-day", daysOut });
  }
  const effectiveDaysOut = REMINDER_OFFSETS.includes(daysOut) ? daysOut : 7;

  const markerKey = `finance_tax_reminder_${quarter.dueDate}_${effectiveDaysOut}d`;
  if (!dry && (await alreadyRan(markerKey))) {
    return NextResponse.json({ ok: true, ran: false, reason: "already-ran", markerKey });
  }

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const ordersResult = await loadFinanceOrders(db);
  if (!ordersResult.ok) {
    return NextResponse.json({
      ok: true,
      ran: false,
      reason: ordersResult.migrationPending ? "migration-pending" : "query-failed",
    });
  }
  const pnl = await buildPnl(db, ordersResult.orders, quarter.periodStart, quarter.periodEnd, settings);
  if ("migrationPending" in pnl) {
    return NextResponse.json({ ok: true, ran: false, reason: "migration-pending" });
  }

  const input = {
    quarterLabel: `Q${quarter.quarter} ${quarter.periodStart.slice(0, 4)} (${quarter.periodStart} to ${quarter.periodEnd})`,
    dueDate: quarter.dueDate,
    daysOut: effectiveDaysOut,
    netProfitCents: pnl.netProfitCents,
    setAside: computeTaxSetAside(pnl.netProfitCents, settings),
    taxMode: settings.taxMode,
  };

  if (dry) {
    return NextResponse.json({ ok: true, dry: true, markerKey, input, body: buildTaxReminderBody(input) });
  }

  const sent = await sendTaxReminder(input);
  await markRan(markerKey, { sent, netProfitCents: pnl.netProfitCents });

  return NextResponse.json({ ok: true, ran: true, sent, markerKey });
}
