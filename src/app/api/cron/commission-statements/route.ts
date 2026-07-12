/**
 * GET /api/cron/commission-statements
 *
 * Monthly affiliate commission settlement. Runs on the 1st (see vercel.json)
 * and settles the month that ended TWO months ago (a ~30-day hold past month
 * close, so most refunds land before we pay). For every affiliate owed a
 * nonzero balance it sends, per affiliate, one of:
 *   - a normal statement, if they're ready to be paid (tax form verified AND a
 *     PayPal email on file), or
 *   - a "get paid" reminder, if they're owed money but not ready yet.
 * It also sends one combined master copy to the accounting inbox
 * (AFFILIATE_STATEMENT_INBOX), annotating who is not yet payable.
 *
 * This cron does NOT move money: disbursement stays a deliberate admin action
 * (admin-disburse), which re-checks the tax/PayPal gates and the $10 minimum.
 * A refund after we've already paid is a manual clawback (offset against a
 * future statement); the hold plus the pay-time owed recompute cover the rest.
 *
 * Gated on CRON_SECRET like the other crons. Idempotent: a sent-marker row in
 * app_config (key commission_statement_<period>) stops a same-day retry from
 * double-sending; the reminder itself is additionally throttled to once per
 * affiliate per month (see sendTaxReminderOnce). Add ?dry=1 to preview what
 * WOULD send without sending or writing markers.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import {
  sendAffiliateStatement,
  sendCombinedStatement,
  statementInbox,
  type NotReadyMap,
} from "@/lib/commission-statement-email";
import { sendTaxReminderOnce } from "@/lib/tax-reminder";

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

/**
 * The month we settle on this run, as YYYY-MM in UTC: two months back from now.
 * On the 1st of month M we settle month M-2, i.e. a ~30-day hold past the close
 * of the month being paid (e.g. run on Sept 1 settles July).
 */
function settledPeriod(): string {
  const now = new Date();
  // Subtract two months on a UTC date; the Date object normalizes year rollover.
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Owed affiliate userId -> whether they can be paid yet. */
type Readiness = { taxVerified: boolean; hasPaypal: boolean };

/** Look up tax-form + PayPal readiness for the given affiliate userIds. */
async function loadReadiness(userIds: string[]): Promise<Map<string, Readiness>> {
  const out = new Map<string, Readiness>();
  if (userIds.length === 0) return out;
  const db = createAdminClient() as unknown as {
    from: (table: string) => {
      select: (cols: string) => {
        in: (col: string, values: string[]) => Promise<{ data: Record<string, unknown>[] | null }>;
      };
    };
  } | null;
  if (!db) return out;
  for (const id of userIds) out.set(id, { taxVerified: false, hasPaypal: false });
  try {
    const { data: tax } = await db
      .from("affiliate_tax_forms")
      .select("user_id,status")
      .in("user_id", userIds);
    for (const row of tax ?? []) {
      const uid = typeof row.user_id === "string" ? row.user_id : null;
      if (uid && out.has(uid)) out.get(uid)!.taxVerified = row.status === "verified";
    }
    const { data: profs } = await db
      .from("profiles")
      .select("id,paypal_email")
      .in("id", userIds);
    for (const row of profs ?? []) {
      const uid = typeof row.id === "string" ? row.id : null;
      const email = typeof row.paypal_email === "string" ? row.paypal_email.trim() : "";
      if (uid && out.has(uid)) out.get(uid)!.hasPaypal = email.length > 0;
    }
  } catch (error) {
    console.error("loadReadiness failed", error);
  }
  return out;
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
  const period = settledPeriod();

  if (!dry && (await alreadySent(period))) {
    return NextResponse.json({ ok: true, sent: false, reason: "already-sent", period });
  }

  // Self-hosted program: we pay EVERY owed affiliate (not just custom-rate
  // top-ups), so statements go to all affiliates with a nonzero balance.
  const result = await loadAffiliateCommissions({ period, customRatesOnly: false, onlyOwed: true });
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const statements = result.statements;

  if (statements.length === 0) {
    if (!dry) await markSent(period, { affiliateCount: 0 });
    return NextResponse.json({ ok: true, sent: false, reason: "nothing-owed", period });
  }

  // Who can actually be paid (verified tax form + PayPal email) vs who is owed
  // money but not ready and should get a reminder instead of a statement.
  const readiness = await loadReadiness(statements.map((s) => s.userId));
  const notReady: NotReadyMap = new Map();
  for (const s of statements) {
    const r = readiness.get(s.userId);
    const missingTax = !r?.taxVerified;
    const missingPaypal = !r?.hasPaypal;
    if (missingTax || missingPaypal) notReady.set(s.userId, { missingTax, missingPaypal });
  }

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      period,
      inbox: statementInbox(),
      affiliates: statements.map((s) => {
        const blocked = notReady.get(s.userId);
        return {
          userId: s.userId,
          email: s.email,
          owedCents: s.owedCents,
          orderCount: s.orderCount,
          ready: !blocked,
          willSend: blocked ? "reminder" : "statement",
          missingTax: blocked?.missingTax ?? false,
          missingPaypal: blocked?.missingPaypal ?? false,
        };
      }),
    });
  }

  const combinedSent = await sendCombinedStatement(statements, period, notReady);
  const adminDb = createAdminClient();
  let individualSent = 0;
  let remindersSent = 0;
  const individualFailed: string[] = [];
  for (const s of statements) {
    const blocked = notReady.get(s.userId);
    if (blocked) {
      if (s.email) {
        const sent = await sendTaxReminderOnce(adminDb, s.userId, {
          to: s.email,
          name: s.fullName,
          owedCents: s.owedCents,
          missingTax: blocked.missingTax,
          missingPaypal: blocked.missingPaypal,
        });
        if (sent) remindersSent += 1;
      }
      continue;
    }
    const ok = await sendAffiliateStatement(s, period);
    if (ok) individualSent += 1;
    else individualFailed.push(s.userId);
  }

  await markSent(period, {
    affiliateCount: statements.length,
    combinedSent,
    individualSent,
    remindersSent,
    individualFailed,
  });

  return NextResponse.json({
    ok: true,
    sent: true,
    period,
    combinedSent,
    individualSent,
    remindersSent,
    individualFailed,
    affiliateCount: statements.length,
  });
}
