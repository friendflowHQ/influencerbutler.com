/**
 * GET /api/cron/commission-statements
 *
 * Monthly affiliate commission statements. Runs on the 1st (see vercel.json),
 * computes the PRIOR month, and for every custom-rate affiliate with a nonzero
 * top-up balance sends: (1) an individual statement to the affiliate, and (2)
 * one combined master copy to the accounting inbox (AFFILIATE_STATEMENT_INBOX).
 *
 * Gated on CRON_SECRET like the other crons. Idempotent: a sent-marker row in
 * app_config (key commission_statement_<period>) stops a same-day retry from
 * double-sending. Add ?dry=1 to preview what WOULD send without sending or
 * writing the marker.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import {
  sendAffiliateStatement,
  sendCombinedStatement,
  statementInbox,
} from "@/lib/commission-statement-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("commission-statements cron: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/** The month just ended, as YYYY-MM in UTC. */
function priorPeriod(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based current month
  const priorMonthNum = m === 0 ? 12 : m; // 1-based prior month
  const priorYear = m === 0 ? y - 1 : y;
  return `${priorYear}-${String(priorMonthNum).padStart(2, "0")}`;
}

type ConfigClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

async function alreadySent(period: string): Promise<boolean> {
  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return false;
  try {
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", `commission_statement_${period}`)
      .maybeSingle();
    return Boolean(data);
  } catch {
    return false;
  }
}

async function markSent(period: string, summary: Record<string, unknown>): Promise<void> {
  const db = createAdminClient() as unknown as ConfigClient | null;
  if (!db) return;
  await db.from("app_config").upsert(
    {
      key: `commission_statement_${period}`,
      value: { sent_at: new Date().toISOString(), ...summary },
      updated_at: new Date().toISOString(),
      updated_by: "cron:commission-statements",
    },
    { onConflict: "key" },
  );
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const period = priorPeriod();

  if (!dry && (await alreadySent(period))) {
    return NextResponse.json({ ok: true, sent: false, reason: "already-sent", period });
  }

  const result = await loadAffiliateCommissions({ period, customRatesOnly: true, onlyOwed: true });
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const statements = result.statements;

  if (statements.length === 0) {
    if (!dry) await markSent(period, { affiliateCount: 0 });
    return NextResponse.json({ ok: true, sent: false, reason: "nothing-owed", period });
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      period,
      inbox: statementInbox(),
      affiliates: statements.map((s) => ({
        userId: s.userId,
        email: s.email,
        owedCents: s.owedCents,
        orderCount: s.orderCount,
      })),
    });
  }

  const combinedSent = await sendCombinedStatement(statements, period);
  let individualSent = 0;
  const individualFailed: string[] = [];
  for (const s of statements) {
    const ok = await sendAffiliateStatement(s, period);
    if (ok) individualSent += 1;
    else individualFailed.push(s.userId);
  }

  await markSent(period, {
    affiliateCount: statements.length,
    combinedSent,
    individualSent,
    individualFailed,
  });

  return NextResponse.json({
    ok: true,
    sent: true,
    period,
    combinedSent,
    individualSent,
    individualFailed,
    affiliateCount: statements.length,
  });
}
