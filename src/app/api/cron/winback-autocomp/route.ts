/**
 * Automatic win-back comp cron.
 *
 * Gives EVERY churned customer a free 3-month Pro comp, no admin approval and no
 * action from the customer. Unlike /api/cron/winback (which only emails a
 * claim link the user must click, and only to people who left a survey answer),
 * this reads the raw `subscriptions` table so it reaches every cancellation, and
 * it force-grants the comp server-side via issueInHouseComp - which creates the
 * synthetic active subscription (= Pro entitlement), mints a license key, and
 * emails the key + download + sign-in link straight away.
 *
 * Guardrails:
 *   - GRACE_DAYS: wait a few days after the cancel before granting, so we don't
 *     undercut the cancellation the instant it happens.
 *   - MAX_AGE_DAYS: don't retro-comp ancient churn.
 *   - PER_RUN_LIMIT: throttle how many grants (and emails) go out per run.
 *   - Once-per-user: anyone who already has an in-house comp_grant is skipped, so
 *     the comp can't be farmed by repeatedly cancelling and never double-issues.
 *   - Live subs skipped: people who already came back are left alone.
 *
 * When a grant lands, we stamp winback_comp_claimed_at on the matching cancel
 * survey row (if any) so the older winback drip stops offering to that user.
 *
 * ?dryRun=1 returns the eligible list WITHOUT granting or emailing anyone - use
 * it for the first safe look. Scheduled daily in vercel.json, guarded by
 * CRON_SECRET like the other crons.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueInHouseComp } from "@/lib/comp-issue";
import { AFFILIATE_COMP_PLAN, AFFILIATE_COMP_SEATS } from "@/lib/affiliate-comps";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const COMP_MONTHS = 3;
// Wait this long after a cancel before granting (short enough to land before the
// older winback drip's day-7 touch, so we don't double-email).
const GRACE_DAYS = 3;
// Don't retro-comp cancellations older than this.
const MAX_AGE_DAYS = 60;
// Cap grants (and emails) per run.
const PER_RUN_LIMIT = 50;
// How many cancelled rows to scan.
const CANDIDATE_LIMIT = 500;
const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];

type CancelledSub = {
  ls_subscription_id: string | null;
  user_id: string | null;
  created_at: string | null;
  ends_at: string | null;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron winback-autocomp: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

/** The cancel time we anchor the grace/age window on: ends_at, else created_at. */
function cancelTime(row: CancelledSub): number | null {
  const iso = row.ends_at ?? row.created_at;
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const supabase = createAdminClient();
  const now = Date.now();
  const oldest = new Date(now - MAX_AGE_DAYS * DAY_MS).toISOString();

  // Real cancellations still inside the window. Exclude our own synthetic comp
  // subscriptions (comp:*), which the expiry cron flips to `cancelled`.
  const { data, error } = await supabase
    .from("subscriptions")
    .select("ls_subscription_id,user_id,created_at,ends_at")
    .eq("status", "cancelled")
    .not("ls_subscription_id", "like", "comp:%")
    .order("ends_at", { ascending: false, nullsFirst: false })
    .limit(CANDIDATE_LIMIT);

  if (error) {
    console.error("cron winback-autocomp: query failed", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const rows = (data ?? []) as CancelledSub[];

  // Dedupe to distinct users whose cancel is past the grace delay, inside max age.
  const seen = new Set<string>();
  const eligibleUserIds: string[] = [];
  for (const row of rows) {
    const userId = row.user_id;
    if (!userId || seen.has(userId)) continue;
    const t = cancelTime(row);
    if (t === null) continue;
    const ageMs = now - t;
    if (ageMs < GRACE_DAYS * DAY_MS) continue; // too soon
    if (new Date(t).toISOString() < oldest) continue; // too old
    seen.add(userId);
    eligibleUserIds.push(userId);
  }

  if (eligibleUserIds.length === 0) {
    return NextResponse.json({ ok: true, dryRun, granted: 0, skipped: 0, considered: rows.length });
  }

  // Skip anyone who already came back (live sub) or already got an in-house comp.
  const liveUsers = new Set<string>();
  const { data: liveSubs } = await supabase
    .from("subscriptions")
    .select("user_id,status")
    .in("user_id", eligibleUserIds)
    .in("status", LIVE_STATUSES);
  for (const s of liveSubs ?? []) {
    if (typeof s.user_id === "string") liveUsers.add(s.user_id);
  }

  const alreadyComped = new Set<string>();
  const { data: grants } = await supabase
    .from("comp_grants")
    .select("user_id,source")
    .eq("source", "in_house")
    .in("user_id", eligibleUserIds);
  for (const g of grants ?? []) {
    if (typeof g.user_id === "string") alreadyComped.add(g.user_id);
  }

  // Emails / names for the survivors.
  const contactByUser = new Map<string, { email: string; name: string }>();
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id,email,full_name")
    .in("id", eligibleUserIds);
  for (const p of profiles ?? []) {
    const id = typeof p.id === "string" ? p.id : null;
    const email = typeof p.email === "string" ? p.email : null;
    if (id && email) {
      contactByUser.set(id, { email, name: typeof p.full_name === "string" ? p.full_name : "" });
    }
  }

  const siteUrl = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");

  let granted = 0;
  let skipped = 0;
  const wouldGrant: string[] = [];

  for (const userId of eligibleUserIds) {
    if (granted >= PER_RUN_LIMIT) break;
    if (liveUsers.has(userId) || alreadyComped.has(userId)) {
      skipped += 1;
      continue;
    }
    const contact = contactByUser.get(userId);
    if (!contact) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      wouldGrant.push(contact.email);
      continue;
    }

    const result = await issueInHouseComp({
      email: contact.email,
      name: contact.name || null,
      months: COMP_MONTHS,
      plan: AFFILIATE_COMP_PLAN,
      seats: AFFILIATE_COMP_SEATS,
      convertLink: `${siteUrl}/pricing`,
    });

    if (!result.ok) {
      // 409 = the account went live between our check and now; treat as skip.
      if (result.status !== 409) {
        console.error("cron winback-autocomp: issue failed", { userId, error: result.error });
      }
      skipped += 1;
      continue;
    }

    // Stop the older winback drip from also offering this user. Best-effort: the
    // grant already stands. Stamp the newest survey row for the user, if any.
    const { data: crRow } = await supabase
      .from("subscription_cancel_reasons")
      .select("id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const crId = typeof crRow?.id === "string" ? crRow.id : null;
    if (crId) {
      const { error: stampErr } = await supabase
        .from("subscription_cancel_reasons")
        .update({ winback_comp_claimed_at: new Date().toISOString() })
        .eq("id", crId);
      if (stampErr) {
        console.error("cron winback-autocomp: stamp cancel row failed", { crId, stampErr });
      }
    }

    granted += 1;
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      wouldGrant: wouldGrant.length,
      skipped,
      considered: rows.length,
      eligible: wouldGrant,
    });
  }

  return NextResponse.json({ ok: true, granted, skipped, considered: rows.length });
}
