// POST /api/admin/finance/filings/nudge
//
// Emails affiliates on the 1099 attention list (reportable but missing or
// unverified tax form) to complete their W-9/W-8BEN so they can be paid and
// filed. Body: { year, userIds?, force? }. Skips anyone nudged in the last 7
// days unless force. Records last-nudged times in app_config.

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { requireFinance } from "@/lib/finance-stepup";
import { sendEmail } from "@/lib/email-send";
import { load1099Data } from "@/lib/finance-1099";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";
const DASHBOARD_URL = "https://www.influencerbutler.com/dashboard/affiliates";
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const gate = await requireFinance("finance.manage", request);
  if (!gate.ok) return gate.response;

  let body: { year?: number; userIds?: string[]; force?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = new Date().getUTCFullYear();
  const year =
    Number.isInteger(body.year) && (body.year as number) >= 2020 && (body.year as number) <= current + 1
      ? (body.year as number)
      : current - 1;
  const today = new Date().toISOString().slice(0, 10);
  const db = createAdminClient();

  const data = await load1099Data(db, year, today);
  if ("queryFailed" in data) {
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const requested = Array.isArray(body.userIds) ? new Set(body.userIds) : null;
  const candidates = data.attention.filter(
    (r) => r.email && (!requested || requested.has(r.userId)),
  );

  // Load nudge history.
  const cfgKey = `finance_1099_nudge_${year}`;
  let history: Record<string, string> = {};
  try {
    const { data: cfg } = await db
      .from("app_config")
      .select("value")
      .eq("key", cfgKey)
      .maybeSingle();
    if (cfg?.value && typeof cfg.value === "object") history = cfg.value as Record<string, string>;
  } catch {
    // none yet
  }

  const now = Date.now();
  const sent: string[] = [];
  const skipped: string[] = [];
  for (const r of candidates) {
    const last = history[r.userId] ? new Date(history[r.userId]).getTime() : 0;
    if (!body.force && Number.isFinite(last) && now - last < SEVEN_DAYS_MS) {
      skipped.push(r.userId);
      continue;
    }
    const name = r.name || r.legalName || "there";
    const text = [
      `Hi ${name},`,
      "",
      "You have affiliate commissions ready with Influencer Butler, but we need your tax form on file before we can pay you and issue your year-end 1099.",
      "",
      "Please add or complete your W-9 (US) or W-8BEN (outside the US) here:",
      DASHBOARD_URL,
      "",
      "It takes a couple of minutes. Reply to this email if you have any questions.",
      "",
      "Thank you,",
      "The Influencer Butler team",
    ].join("\n");
    const { ok } = await sendEmail({
      from: FROM_ADDRESS,
      to: r.email as string,
      subject: "Action needed: add your tax form to get paid",
      text,
      category: "finance_1099_nudge",
    });
    if (ok) {
      history[r.userId] = new Date().toISOString();
      sent.push(r.userId);
    }
  }

  if (sent.length > 0) {
    await db.from("app_config").upsert(
      {
        key: cfgKey,
        value: history,
        updated_at: new Date().toISOString(),
        updated_by: gate.actor.email,
      },
      { onConflict: "key" },
    );
  }

  await logAdminAction({
    actor: gate.actor,
    action: "finance.1099.nudge",
    targetType: "year",
    targetId: String(year),
    details: { sent, skipped },
  });

  return NextResponse.json({ ok: true, sent: sent.length, skipped: skipped.length });
}
