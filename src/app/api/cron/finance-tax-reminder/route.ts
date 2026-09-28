// GET /api/cron/finance-tax-reminder
//
// Daily (15:00 UTC = 9am MDT / 8am MST), America/Denver wall clock. Two
// independent blocks run and report separately in one response:
//   - Quarterly estimated income tax: 7 days and 1 day before each deadline.
//   - 1099-NEC: Jan 6 and Jan 24 (25/7 days before the Jan 31 deadline).
// Idempotent per block via app_config markers. ?dry=1 previews without sending;
// ?force=1 skips the date gate. Gated on CRON_SECRET like the other crons.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { localParts, DEFAULT_DIGEST_TIMEZONE } from "@/lib/daily-digest";
import { loadFinanceSettings } from "@/lib/finance-settings";
import { loadFinanceOrders } from "@/lib/finance-orders-data";
import { buildPnl } from "@/lib/finance-report";
import { nextDeadline, daysUntil, computeTaxSetAside } from "@/lib/finance-tax";
import {
  sendTaxReminder,
  buildTaxReminderBody,
  send1099Reminder,
  build1099ReminderBody,
} from "@/lib/finance-tax-reminder-email";
import { load1099Data } from "@/lib/finance-1099";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMINDER_OFFSETS = [7, 1];
// Days before Jan 31 that the 1099 reminder fires (Jan 6 and Jan 24).
const OFFSETS_1099 = [25, 7];

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

async function runQuarterly(today: string, dry: boolean, force: boolean): Promise<unknown> {
  const { quarter } = nextDeadline(today);
  const daysOut = daysUntil(today, quarter.dueDate);
  if (!force && !REMINDER_OFFSETS.includes(daysOut)) {
    return { ran: false, reason: "not-a-reminder-day", daysOut };
  }
  const effectiveDaysOut = REMINDER_OFFSETS.includes(daysOut) ? daysOut : 7;
  const markerKey = `finance_tax_reminder_${quarter.dueDate}_${effectiveDaysOut}d`;
  if (!dry && (await alreadyRan(markerKey))) {
    return { ran: false, reason: "already-ran", markerKey };
  }

  const db = createAdminClient();
  const settings = await loadFinanceSettings(db);
  const ordersResult = await loadFinanceOrders(db);
  if (!ordersResult.ok) {
    return { ran: false, reason: ordersResult.migrationPending ? "migration-pending" : "query-failed" };
  }
  const pnl = await buildPnl(db, ordersResult.orders, quarter.periodStart, quarter.periodEnd, settings);
  if ("migrationPending" in pnl) {
    return { ran: false, reason: "migration-pending" };
  }

  const input = {
    quarterLabel: `Q${quarter.quarter} ${quarter.periodStart.slice(0, 4)} (${quarter.periodStart} to ${quarter.periodEnd})`,
    dueDate: quarter.dueDate,
    daysOut: effectiveDaysOut,
    netProfitCents: pnl.netProfitCents,
    setAside: computeTaxSetAside(pnl.netProfitCents, settings),
    taxMode: settings.taxMode,
    useTaxOwedCents: pnl.useTaxOwedCents,
  };
  if (dry) return { dry: true, markerKey, input, body: buildTaxReminderBody(input) };

  const sent = await sendTaxReminder(input);
  await markRan(markerKey, { sent, netProfitCents: pnl.netProfitCents });
  return { ran: true, sent, markerKey };
}

async function run1099(today: string, dry: boolean, force: boolean): Promise<unknown> {
  const year = Number(today.slice(0, 4));
  const dueDate = `${year}-01-31`;
  const daysOut = daysUntil(today, dueDate);
  if (!force && !OFFSETS_1099.includes(daysOut)) {
    return { ran: false, reason: "not-a-reminder-day", daysOut };
  }
  const effectiveDaysOut = OFFSETS_1099.includes(daysOut) ? daysOut : 25;
  const taxYear = year - 1;
  const markerKey = `finance_1099_reminder_${taxYear}_${effectiveDaysOut}d`;
  if (!dry && (await alreadyRan(markerKey))) {
    return { ran: false, reason: "already-ran", markerKey };
  }

  const db = createAdminClient();
  const data = await load1099Data(db, taxYear, today);
  if ("queryFailed" in data) return { ran: false, reason: "query-failed" };

  const reportableUs = data.us.filter((p) => p.reportable);
  const reportableCount = reportableUs.length;
  const totalCents = reportableUs.reduce((s, p) => s + p.totalCents, 0);
  const unfiledCount = reportableUs.filter((p) => {
    const st = p.filing?.status;
    return st !== "filed" && st !== "corrected" && st !== "exempt";
  }).length;
  const missingFormsCount = reportableUs.filter((p) => p.formStatus !== "verified").length;

  if (reportableCount === 0 || (unfiledCount === 0 && missingFormsCount === 0)) {
    return { ran: false, reason: "nothing-to-file", reportableCount, unfiledCount };
  }

  const input = {
    taxYear,
    dueDate,
    daysOut: effectiveDaysOut,
    reportableCount,
    unfiledCount,
    missingFormsCount,
    totalCents,
  };
  if (dry) return { dry: true, markerKey, input, body: build1099ReminderBody(input) };

  const sent = await send1099Reminder(input);
  await markRan(markerKey, { sent, reportableCount, unfiledCount });
  return { ran: true, sent, markerKey };
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

  const quarterly = await runQuarterly(today, dry, force);
  const filings1099 = await run1099(today, dry, force);

  return NextResponse.json({ ok: true, today, quarterly, filings1099 });
}
