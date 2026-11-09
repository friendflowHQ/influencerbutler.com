/**
 * POST /api/admin/billing/repair-trial-conversions
 * Body: { dryRun?: boolean }  (defaults to a dry run)
 *
 * One-off repair for trials wrongly stamped as converted. Before
 * isRealTrialConversion (src/lib/trial-conversion.ts), a Lemon Squeezy
 * `subscription_updated` reporting "active" mid-trial set trial_converted_at,
 * so affiliate dashboards and the trial funnel showed "Converted to paid" for
 * customers who never paid.
 *
 * A row is repaired (trial_converted_at cleared) only when BOTH hold:
 *   - the stamp landed within 24 hours of the trial start (no real trial can
 *     convert that fast; the bug stamped 0-2 minutes in), and
 *   - the customer has NO order above $0 created at or after the trial start.
 * The time rule matters: some genuine early conversions (3-day trials in mid
 * 2026) have no charge row in `orders`, and those must keep their stamp. A
 * later genuine conversion re-stamps through the normal webhook path.
 * Audit-logged.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A conversion stamped this soon after the trial started cannot be real. */
const MAX_BOGUS_GAP_MS = 24 * 60 * 60 * 1000;

type AnyClient = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

type SubRow = {
  id: string;
  user_id: string | null;
  status: string | null;
  trial_started_at: string | null;
  trial_converted_at: string | null;
};

export async function POST(request: Request) {
  const actor = await requirePermission("billing.comp", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let dryRun = true;
  try {
    const body = (await request.json()) as { dryRun?: unknown };
    if (body && body.dryRun === false) dryRun = false;
  } catch {
    // Empty body = dry run.
  }

  const client = createAdminClient();
  if (!client) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const db = client as unknown as AnyClient;

  const { data: subsData, error: subsErr } = await db
    .from("subscriptions")
    .select("id,user_id,status,trial_started_at,trial_converted_at")
    .not("trial_started_at", "is", null)
    .not("trial_converted_at", "is", null)
    .limit(5000);
  if (subsErr) {
    console.error("repair-trial-conversions: subscriptions read failed", subsErr);
    return NextResponse.json({ error: "Subscriptions read failed" }, { status: 500 });
  }
  const subs = (subsData ?? []) as SubRow[];

  const userIds = [...new Set(subs.map((s) => s.user_id).filter((u): u is string => Boolean(u)))];
  const paidAtByUser = new Map<string, number[]>();
  for (let i = 0; i < userIds.length; i += 200) {
    const chunk = userIds.slice(i, i + 200);
    const { data, error } = await db
      .from("orders")
      .select("user_id,total,status,created_at")
      .in("user_id", chunk)
      .gt("total", 0);
    if (error) {
      console.error("repair-trial-conversions: orders read failed", error);
      return NextResponse.json({ error: "Orders read failed" }, { status: 500 });
    }
    for (const o of (data ?? []) as Record<string, unknown>[]) {
      const uid = typeof o.user_id === "string" ? o.user_id : null;
      const at = typeof o.created_at === "string" ? Date.parse(o.created_at) : NaN;
      if (!uid || Number.isNaN(at)) continue;
      if (o.status === "refunded") continue;
      const list = paidAtByUser.get(uid) ?? [];
      list.push(at);
      paidAtByUser.set(uid, list);
    }
  }

  const bogus = subs.filter((s) => {
    if (!s.user_id) return false;
    const startMs = Date.parse(s.trial_started_at as string);
    if (Number.isNaN(startMs)) return false;
    const convertedMs = Date.parse(s.trial_converted_at as string);
    if (Number.isNaN(convertedMs) || convertedMs - startMs > MAX_BOGUS_GAP_MS) return false;
    const paid = paidAtByUser.get(s.user_id) ?? [];
    return !paid.some((at) => at >= startMs - 60 * 60 * 1000);
  });

  let repaired = 0;
  if (!dryRun) {
    for (const s of bogus) {
      const { error } = await db
        .from("subscriptions")
        .update({ trial_converted_at: null })
        .eq("id", s.id);
      if (error) {
        console.warn("repair-trial-conversions: clear failed", s.id, error);
        continue;
      }
      repaired += 1;
    }
    await logAdminAction({
      actor,
      action: "billing.trial_conversions.repair",
      targetType: "system",
      targetId: "subscriptions",
      details: { candidates: bogus.length, repaired, subscriptionIds: bogus.map((s) => s.id) },
    });
  }

  return NextResponse.json({
    dryRun,
    scanned: subs.length,
    candidates: bogus.length,
    repaired,
    rows: bogus.map((s) => ({
      subscriptionId: s.id,
      status: s.status,
      trialStartedAt: s.trial_started_at,
      trialConvertedAt: s.trial_converted_at,
    })),
  });
}
