/**
 * Win-back drip cron.
 *
 * Re-engages churned customers captured in subscription_cancel_reasons with up
 * to three touches, anchored on the cancellation's created_at:
 *   t1 (Day 7)  - "we heard you / here's what's new", no offer
 *   t2 (Day 21) - the offer (comp claim link, or a re-subscribe discount code)
 *   t3 (Day 45) - last call, same offer
 *
 * Segmentation (see resolveSegment): "too expensive" cancels get a Lemon Squeezy
 * discount code; everyone else gets a free 2-month comp delivered by a claim
 * link that only mints when clicked.
 *
 * Idempotent + self-throttling like the other funnels: one winback_t{n}_sent_at
 * column per tier, stamped only on a successful send, one tier per row per run,
 * capped at PER_RUN_LIMIT. Rows where the customer said would_return = "no", or
 * who now have a live subscription again, are skipped. Suppression / unsubscribe
 * is handled inside sendMarketingEmail.
 *
 * Scheduled daily in vercel.json, guarded by CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";
import { getDiscountableVariantIds } from "@/lib/lemonsqueezy";
import {
  sendWinbackEmail,
  resolveSegment,
  winbackClaimUrl,
  winbackDiscountPercent,
  WINBACK_DISCOUNT_MONTHS,
  type WinbackTier,
} from "@/lib/winback-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
// Tier age thresholds, most-aged first so a backlog jumps straight to the
// strongest matured tier rather than dripping a stale 3-week sequence.
const TIERS: { tier: WinbackTier; sentCol: string; thresholdMs: number }[] = [
  { tier: "t3", sentCol: "winback_t3_sent_at", thresholdMs: 45 * DAY_MS },
  { tier: "t2", sentCol: "winback_t2_sent_at", thresholdMs: 21 * DAY_MS },
  { tier: "t1", sentCol: "winback_t1_sent_at", thresholdMs: 7 * DAY_MS },
];
// Don't consider rows older than this: past t3 + a catch-up buffer, there's
// nothing left to send.
const MAX_AGE_MS = 75 * DAY_MS;
const CANDIDATE_LIMIT = 500;
const PER_RUN_LIMIT = 100;
const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];

type CancelRow = {
  id: string;
  user_id: string | null;
  reason: string | null;
  would_return: string | null;
  created_at: string | null;
  winback_t1_sent_at: string | null;
  winback_t2_sent_at: string | null;
  winback_t3_sent_at: string | null;
  winback_discount_code: string | null;
  winback_comp_claimed_at: string | null;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron winback: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/** Highest matured tier whose sent column is still null, or null if none due. */
function dueTier(row: CancelRow, ageMs: number): { tier: WinbackTier; sentCol: string } | null {
  for (const t of TIERS) {
    if (ageMs < t.thresholdMs) continue;
    if (row[t.sentCol as keyof CancelRow]) continue;
    return { tier: t.tier, sentCol: t.sentCol };
  }
  return null;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = Date.now();
  const oldest = new Date(now - MAX_AGE_MS).toISOString();

  // Churned rows still inside the drip window, minus explicit "won't return".
  // PostgREST neq would also drop NULLs, so keep them explicitly via .or.
  const { data, error } = await supabase
    .from("subscription_cancel_reasons")
    .select(
      "id,user_id,reason,would_return,created_at,winback_t1_sent_at,winback_t2_sent_at,winback_t3_sent_at,winback_discount_code,winback_comp_claimed_at",
    )
    .gte("created_at", oldest)
    .or("would_return.is.null,would_return.neq.no")
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_LIMIT);

  if (error) {
    console.error("cron winback: query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const rows = (data ?? []) as CancelRow[];

  // Dedupe by user: rows are newest-first, so the first row per user is the most
  // recent cancellation and the one we drip off. A user with no user_id is skipped.
  const seenUsers = new Set<string>();
  const candidates: { row: CancelRow; tier: WinbackTier; sentCol: string }[] = [];
  for (const row of rows) {
    if (!row.user_id || seenUsers.has(row.user_id)) continue;
    seenUsers.add(row.user_id);
    // Already converted on the comp offer -> never re-offer, regardless of
    // whether that comp has since expired and dropped them off the live-sub set.
    if (row.winback_comp_claimed_at) continue;
    if (!row.created_at) continue;
    const ageMs = now - new Date(row.created_at).getTime();
    if (!Number.isFinite(ageMs)) continue;
    const due = dueTier(row, ageMs);
    if (due) candidates.push({ row, tier: due.tier, sentCol: due.sentCol });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0, considered: rows.length });
  }

  const userIds = candidates.map((c) => c.row.user_id as string);

  // Batch: who re-subscribed (skip them), and everyone's email/name.
  const liveUsers = new Set<string>();
  const { data: liveSubs } = await supabase
    .from("subscriptions")
    .select("user_id,status")
    .in("user_id", userIds)
    .in("status", LIVE_STATUSES);
  for (const s of liveSubs ?? []) {
    if (typeof s.user_id === "string") liveUsers.add(s.user_id);
  }

  const contactByUser = new Map<string, { email: string; name: string }>();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email,full_name")
    .in("id", userIds);
  for (const p of profiles ?? []) {
    const id = typeof p.id === "string" ? p.id : null;
    const email = typeof p.email === "string" ? p.email : null;
    if (id && email) {
      contactByUser.set(id, { email, name: typeof p.full_name === "string" ? p.full_name : "" });
    }
  }

  const discountPercent = winbackDiscountPercent();
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const discountVariantIds = getDiscountableVariantIds();

  let sent = 0;
  let skipped = 0;

  for (const { row, tier, sentCol } of candidates) {
    if (sent >= PER_RUN_LIMIT) break;
    const userId = row.user_id as string;

    if (liveUsers.has(userId)) {
      skipped += 1;
      continue;
    }
    const contact = contactByUser.get(userId);
    if (!contact) {
      skipped += 1;
      continue;
    }

    const segment = resolveSegment(row.reason);

    // Discount segment offer tiers (t2/t3) need a code. Reuse the stored one, or
    // mint it once and persist immediately so a later retry never double-mints.
    let discountCode = row.winback_discount_code ?? undefined;
    if (segment === "discount" && tier !== "t1" && !discountCode) {
      if (!storeId || discountVariantIds.length === 0) {
        // Can't mint a safely-scoped code: skip (retry once env is configured)
        // rather than fall through to an offer email with no code.
        console.error("cron winback: cannot mint discount", {
          hasStore: Boolean(storeId),
          variantCount: discountVariantIds.length,
        });
        skipped += 1;
        continue;
      }
      const minted = await createUniqueDiscount({
        storeId,
        percentOff: discountPercent,
        namePrefix: "COMEBACK",
        durationMonths: WINBACK_DISCOUNT_MONTHS,
        expiresAt: new Date(now + 30 * DAY_MS).toISOString(),
        variantIds: discountVariantIds,
        name: `Win-back ${discountPercent}% (user ${userId.slice(0, 8)})`,
      });
      if (!minted) {
        skipped += 1;
        continue;
      }
      discountCode = minted.code;
      const { error: codeErr } = await supabase
        .from("subscription_cancel_reasons")
        .update({ winback_discount_code: discountCode })
        .eq("id", row.id);
      if (codeErr) {
        console.error("cron winback: persist discount code failed", { id: row.id, codeErr });
        skipped += 1;
        continue;
      }
    }

    const ok = await sendWinbackEmail({
      segment,
      tier,
      to: contact.email,
      name: contact.name,
      reason: row.reason,
      claimUrl: winbackClaimUrl(row.id),
      discountCode,
      discountPercent,
    });
    if (!ok) {
      skipped += 1;
      continue;
    }

    const { error: stampErr } = await supabase
      .from("subscription_cancel_reasons")
      .update({ [sentCol]: new Date().toISOString() })
      .eq("id", row.id);
    if (stampErr) {
      console.error("cron winback: stamp failed", { id: row.id, sentCol, stampErr });
      continue;
    }
    sent += 1;
  }

  return NextResponse.json({ ok: true, sent, skipped, considered: rows.length });
}
