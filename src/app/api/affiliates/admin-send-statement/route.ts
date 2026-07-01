import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import {
  sendAffiliateStatement,
  sendCombinedStatement,
  statementInbox,
} from "@/lib/commission-statement-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * On-demand send of monthly commission statements for a period + selected
 * affiliates. Mirrors what the /api/cron/commission-statements job sends on the
 * 1st, but triggered from the Payouts tab.
 *
 * Body: { period: 'YYYY-MM', userIds: string[], sendCombined?: boolean,
 *         sendIndividual?: boolean }.
 */

type SendBody = {
  period?: string;
  userIds?: string[];
  sendCombined?: boolean;
  sendIndividual?: boolean;
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: SendBody;
  try {
    body = (await request.json()) as SendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const period = body.period?.trim();
  if (!period) return NextResponse.json({ error: "Missing period" }, { status: 400 });

  const userIds = Array.isArray(body.userIds)
    ? body.userIds.map((id) => String(id).trim()).filter((id) => id.length > 0)
    : [];
  if (userIds.length === 0) {
    return NextResponse.json({ error: "Select at least one affiliate" }, { status: 400 });
  }

  const sendCombined = body.sendCombined !== false; // default on
  const sendIndividual = body.sendIndividual === true; // default off

  const result = await loadAffiliateCommissions({ period, userIds, customRatesOnly: true });
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const statements = result.statements;

  let combinedSent = false;
  let individualSent = 0;
  const individualFailed: string[] = [];

  if (sendCombined && statements.length > 0) {
    combinedSent = await sendCombinedStatement(statements, period);
  }

  if (sendIndividual) {
    for (const s of statements) {
      const ok = await sendAffiliateStatement(s, period);
      if (ok) individualSent += 1;
      else individualFailed.push(s.userId);
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.commission.statement.send",
    targetType: "period",
    targetId: period,
    details: { userIds, sendCombined, sendIndividual, combinedSent, individualSent, individualFailed },
  });

  return NextResponse.json({
    ok: true,
    period,
    inbox: statementInbox(),
    combinedSent,
    individualSent,
    individualFailed,
    affiliateCount: statements.length,
  });
}
