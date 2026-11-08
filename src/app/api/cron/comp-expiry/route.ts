/**
 * GET /api/cron/comp-expiry
 *
 * Daily (see vercel.json). Walks every comped subscription (loadComps) and:
 *   - 7 days out: emails a warning (once, marked by warn7_sent_at)
 *   - 1 day out:  emails a warning (once, marked by warn1_sent_at)
 *   - at/after expiry: cancels the subscription via Lemon Squeezy so the owner's
 *     card is never charged, marked by cancelled_at
 * Comps whose duration could not be parsed (unknown-months) are NEVER cancelled;
 * they are surfaced in the digest so the owner sets the months by hand.
 *
 * Gated on CRON_SECRET like the other crons. Idempotent via the comp_grants
 * marker columns. Add ?dry=1 to preview without cancelling, stamping, or
 * emailing. Requires the 20260711_comp_grants migration; without it the marker
 * upserts fail (logged) but the cancel still happens - apply it in prod first.
 */
import { NextResponse } from "next/server";
import { adminService } from "@/lib/admin-service";
import { logAdminAction } from "@/lib/admin-audit";
import { loadComps, type CompRow } from "@/lib/comps-data";
import { cancelCompSubscription } from "@/lib/comps-cancel";
import { sendCompDigest } from "@/lib/comp-expiry-email";
import { verifyBearer } from "@/lib/auth-secret";
import {
  CUSTOMER_NOTICE_KINDS,
  sendCustomerCompEmail,
  sendOwnerCreatorAlert,
} from "@/lib/comp-expiry-customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  return verifyBearer(request, "CRON_SECRET");
}

/** Stamp a warn marker (and context) on the comp_grants row. Best-effort. */
async function stampWarn(row: CompRow, field: "warn7_sent_at" | "warn1_sent_at"): Promise<void> {
  const svc = adminService();
  if (!svc) return;
  const nowIso = new Date().toISOString();
  try {
    const { error } = await svc.from("comp_grants").upsert(
      {
        ls_subscription_id: row.lsSubscriptionId,
        user_id: row.userId,
        user_email: row.email,
        discount_code: row.discountCode,
        months: row.months,
        months_source: row.monthsSource,
        issued_at: row.issuedAt,
        expires_at: row.expiresAt,
        [field]: nowIso,
        updated_at: nowIso,
      },
      { onConflict: "ls_subscription_id" },
    );
    if (error) console.error("comp-expiry: warn stamp failed", error);
  } catch (error) {
    console.error("comp-expiry: warn stamp threw", error);
  }
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const result = await loadComps();
  if (!result) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const toCancel: CompRow[] = [];
  const toWarn7: CompRow[] = [];
  const toWarn1: CompRow[] = [];
  const needsMonths: CompRow[] = [];

  for (const row of result.rows) {
    if (row.state === "cancelled") continue;
    if (row.state === "forever") continue; // never expires, never dunned
    // Only skip when we cannot tell WHEN it ends. Day-granular in-house comps
    // have an explicit expires_at (daysRemaining known) but months null, so they
    // must still be cancelled - gate on daysRemaining, not months.
    if (row.state === "unknown-months" || row.daysRemaining == null) {
      needsMonths.push(row);
      continue;
    }
    if (row.daysRemaining <= 0) {
      toCancel.push(row);
    } else if (row.daysRemaining <= 1 && !row.warn1SentAt) {
      toWarn1.push(row);
    } else if (row.daysRemaining <= 7 && !row.warn7SentAt) {
      toWarn7.push(row);
    }
  }

  // Customer-facing notices (win-back + creator comps only) and the owner's
  // per-creator "ends in 7 days, extend?" alert. A comp that already converted
  // to a paid plan gets nothing.
  const custWarn7: CompRow[] = [];
  const custWarn1: CompRow[] = [];
  const ownerCreator: CompRow[] = [];
  for (const row of result.rows) {
    if (row.state === "cancelled" || row.state === "forever") continue;
    if (row.convertedAt) continue;
    if (!row.kind || !CUSTOMER_NOTICE_KINDS.has(row.kind)) continue;
    const d = row.daysRemaining;
    if (d == null || d <= 0) continue;
    if (d <= 1 && !row.userWarn1SentAt) custWarn1.push(row);
    else if (d <= 7 && !row.userWarn7SentAt && !row.userWarn1SentAt) custWarn7.push(row);
    if (row.kind === "creator" && d <= 7 && !row.ownerCreatorWarnSentAt) ownerCreator.push(row);
  }

  const summarize = (r: CompRow) => ({
    email: r.email,
    code: r.discountCode,
    daysRemaining: r.daysRemaining,
    lsSubscriptionId: r.lsSubscriptionId,
  });

  if (dry) {
    return NextResponse.json({
      ok: true,
      dry: true,
      wouldCancel: toCancel.map(summarize),
      wouldWarn: [...toWarn1, ...toWarn7].map(summarize),
      needsMonths: needsMonths.map(summarize),
      wouldEmailCustomer7: custWarn7.map(summarize),
      wouldEmailCustomer1: custWarn1.map(summarize),
      wouldAlertOwnerCreator: ownerCreator.map(summarize),
    });
  }

  // Customer emails. Stamp FIRST and only send when the stamp landed, so a
  // missing column (20261108 migration not applied yet) can never turn into a
  // daily repeat email.
  const customerEmailed: CompRow[] = [];
  for (const row of custWarn1) {
    if (!(await stampColumns(row, ["user_warn1_sent_at", "user_warn7_sent_at"]))) continue;
    if (await sendCustomerCompEmail(row, "warn1")) customerEmailed.push(row);
  }
  for (const row of custWarn7) {
    if (!(await stampColumns(row, ["user_warn7_sent_at"]))) continue;
    if (await sendCustomerCompEmail(row, "warn7")) customerEmailed.push(row);
  }
  const ownerAlerted: CompRow[] = [];
  for (const row of ownerCreator) {
    if (!(await stampColumns(row, ["owner_creator_warn_sent_at"]))) continue;
    if (await sendOwnerCreatorAlert(row)) ownerAlerted.push(row);
  }

  // Cancel expired comps.
  const cancelled: CompRow[] = [];
  for (const row of toCancel) {
    const res = await cancelCompSubscription(
      row.lsSubscriptionId,
      {
        userId: row.userId,
        email: row.email,
        discountCode: row.discountCode,
        months: row.months,
        monthsSource: row.monthsSource,
        issuedAt: row.issuedAt,
        expiresAt: row.expiresAt,
      },
      row.source,
    );
    await logAdminAction({
      actor: null,
      action: "comps.cancel",
      targetType: "subscription",
      targetId: row.lsSubscriptionId,
      details: { source: "cron:comp-expiry", email: row.email, code: row.discountCode, ok: res.ok },
    });
    if (res.ok) cancelled.push(row);
  }

  // Warn upcoming comps (stamp so we only warn once per tier).
  for (const row of toWarn1) await stampWarn(row, "warn1_sent_at");
  for (const row of toWarn7) await stampWarn(row, "warn7_sent_at");

  const warned = [...toWarn1, ...toWarn7];

  // Email a digest only when there is something actionable (skip needs-months-
  // only days so the owner is not pinged daily about the same manual-entry item).
  let emailed = false;
  if (cancelled.length > 0 || warned.length > 0) {
    emailed = await sendCompDigest({ cancelled, warn: warned, needsMonths });
  }

  return NextResponse.json({
    ok: true,
    cancelled: cancelled.map(summarize),
    warned: warned.map(summarize),
    needsMonths: needsMonths.map(summarize),
    emailed,
    customerEmailed: customerEmailed.map(summarize),
    ownerCreatorAlerted: ownerAlerted.map(summarize),
  });
}

/**
 * Stamp one or more marker columns on a comp_grants row (only the markers, so
 * it never upserts a partial row). Returns false when the update failed, e.g.
 * the 20261108 columns are not in prod yet: the caller then skips the send.
 */
async function stampColumns(row: CompRow, fields: string[]): Promise<boolean> {
  const svc = adminService();
  if (!svc) return false;
  const nowIso = new Date().toISOString();
  const patch: Record<string, string> = { updated_at: nowIso };
  for (const f of fields) patch[f] = nowIso;
  try {
    const { error } = await svc
      .from("comp_grants")
      .update(patch)
      .eq("ls_subscription_id", row.lsSubscriptionId);
    if (error) {
      console.error("comp-expiry: marker stamp failed", { fields, error });
      return false;
    }
    return true;
  } catch (error) {
    console.error("comp-expiry: marker stamp threw", error);
    return false;
  }
}
