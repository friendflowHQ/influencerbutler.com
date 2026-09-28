/**
 * Dormant-affiliate activation drip.
 *
 * Approved affiliates who have never driven a referred order ("dormant", $0
 * earned) get two escalating nudges, anchored on their approval date
 * (affiliate_applications.reviewed_at):
 *
 *   day 7  -> the swipe-kit activation email (their link + copy-paste captions).
 *   day 21 -> gift them a 30-day free-Pro comp via issueInHouseComp, then email
 *             the "on us, go get going" framing. If they already have Pro,
 *             issueInHouseComp returns 409, we skip the grant, and send the
 *             "you're all set, here's how to earn" variant instead.
 *
 * One step per affiliate per run (day 21 wins when both are due), each sent at
 * most once via its own sent-at column on affiliate_applications. Dormancy is
 * computed from the real commission engine (loadAffiliateCommissions), so a
 * producing affiliate is never told to "get going".
 *
 * ?dryRun=1 returns the eligible list WITHOUT sending or granting anything.
 * Scheduled daily in vercel.json, guarded by CRON_SECRET like the other crons.
 * Defensive: a missing new column (prod schema is migrated by hand and lags)
 * makes the run no-op rather than 500.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueInHouseComp } from "@/lib/comp-issue";
import { AFFILIATE_COMP_PLAN, AFFILIATE_COMP_SEATS } from "@/lib/affiliate-comps";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import {
  buildActivationDay7Email,
  buildActivationCompEmail,
  sendAffiliateActivationEmail,
} from "@/lib/affiliate-activation-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
const DAY7_MS = 7 * DAY_MS;
const DAY21_MS = 21 * DAY_MS;
// Cap grants/emails per run so a first run over a backlog stays gentle.
const PER_RUN_LIMIT = 40;
// How many approved rows to scan.
const CANDIDATE_LIMIT = 500;

type AppRow = {
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  reviewed_at: string | null;
  activation_email_day7_sent_at: string | null;
  activation_comp_day21_sent_at: string | null;
};

type ProfileRow = {
  id: string;
  is_affiliate: boolean | null;
  affiliate_code: string | null;
  affiliate_comp_monthly_quota: number | null;
};

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron affiliate-activation: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function firstNameOf(name: string | null): string {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const supabase = createAdminClient();
  const now = Date.now();
  const day7Cutoff = new Date(now - DAY7_MS).toISOString();

  const siteUrl = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");

  // Approved affiliates whose approval is at least 7 days old, oldest first.
  const { data: appData, error: appErr } = await supabase
    .from("affiliate_applications")
    .select(
      "user_id,email,full_name,reviewed_at,activation_email_day7_sent_at,activation_comp_day21_sent_at",
    )
    .eq("status", "approved")
    .lte("reviewed_at", day7Cutoff)
    .order("reviewed_at", { ascending: true, nullsFirst: false })
    .limit(CANDIDATE_LIMIT);

  if (appErr) {
    // Most likely the new sent-at columns are not applied in prod yet. No-op.
    console.error("cron affiliate-activation: application query failed (schema not applied?)", appErr);
    return NextResponse.json({ ok: true, skipped: "schema", granted: 0, emailed: 0 });
  }

  const apps = ((appData ?? []) as AppRow[]).filter((a) => a.user_id && a.reviewed_at);
  if (apps.length === 0) {
    return NextResponse.json({ ok: true, granted: 0, emailed: 0, considered: 0 });
  }

  // Dormancy: producing affiliates (earnedCents > 0) are excluded. If we cannot
  // load the commission engine we must NOT guess - abort so we never email a
  // producing affiliate a "you're dormant" nudge.
  const commissions = await loadAffiliateCommissions({});
  if (!commissions) {
    console.error("cron affiliate-activation: commissions load failed - aborting to stay safe");
    return NextResponse.json({ ok: false, error: "commissions unavailable" }, { status: 200 });
  }
  const producing = new Set<string>();
  for (const s of commissions.statements) {
    if (s.earnedCents > 0) producing.add(s.userId);
  }

  // Profiles for the cohort: live-affiliate flag, code (needed for the link),
  // and comp quota (drives the swipe-kit bonus line).
  const userIds = apps.map((a) => a.user_id as string);
  const { data: profData } = await supabase
    .from("profiles")
    .select("id,is_affiliate,affiliate_code,affiliate_comp_monthly_quota")
    .in("id", userIds);
  const profileById = new Map<string, ProfileRow>();
  for (const p of (profData ?? []) as ProfileRow[]) {
    if (typeof p.id === "string") profileById.set(p.id, p);
  }

  let granted = 0;
  let emailed = 0;
  let skipped = 0;
  const wouldAct: Array<{ email: string; tier: "day7" | "comp" }> = [];

  for (const app of apps) {
    if (emailed >= PER_RUN_LIMIT) break;
    const userId = app.user_id as string;
    const email = (app.email ?? "").trim();
    const profile = profileById.get(userId);

    // Must be a live affiliate with a code (needs a shareable link) and dormant.
    if (!email || !profile || profile.is_affiliate !== true || !profile.affiliate_code) {
      skipped += 1;
      continue;
    }
    if (producing.has(userId)) {
      skipped += 1;
      continue;
    }

    const code = profile.affiliate_code;
    const firstName = firstNameOf(app.full_name);
    const age = now - new Date(app.reviewed_at as string).getTime();
    if (!Number.isFinite(age)) {
      skipped += 1;
      continue;
    }

    // The comp is the escalation, so it only fires once the day-7 swipe kit has
    // gone out. That keeps the sequence intro -> escalation for everyone,
    // including the current backlog (they get day7 on one run, the comp the
    // next), instead of hitting long-dormant affiliates with the gift cold.
    const day7Due = age >= DAY7_MS && !app.activation_email_day7_sent_at;
    const compDue =
      age >= DAY21_MS && !app.activation_comp_day21_sent_at && !!app.activation_email_day7_sent_at;

    // Highest matured, still-unsent step wins.
    if (compDue) {
      if (dryRun) {
        wouldAct.push({ email, tier: "comp" });
        continue;
      }

      const result = await issueInHouseComp({
        email,
        name: app.full_name,
        months: null,
        days: 30,
        plan: AFFILIATE_COMP_PLAN,
        seats: AFFILIATE_COMP_SEATS,
        convertLink: `${siteUrl}/pricing`,
        issuerName: "the Influencer Butler team",
      });

      const alreadyPro = !result.ok && result.status === 409;
      if (!result.ok && !alreadyPro) {
        console.error("cron affiliate-activation: comp grant failed", {
          userId,
          status: result.status,
          error: result.error,
        });
        skipped += 1;
        continue; // no stamp -> retried next run
      }

      if (result.ok) granted += 1;

      const { subject, text } = buildActivationCompEmail({ firstName, code, alreadyPro });
      const sent = await sendAffiliateActivationEmail({ to: email, subject, text, tier: "comp" });

      // Stamp the step done. When the grant succeeded we stamp regardless of the
      // marketing email (the comp - and its own key email - already landed, and
      // a retry would just 409). When it was already-Pro, only stamp on a sent
      // email so a transient email failure can retry.
      if (result.ok || sent) {
        const { error: stampErr } = await supabase
          .from("affiliate_applications")
          .update({ activation_comp_day21_sent_at: new Date().toISOString() })
          .eq("user_id", userId);
        if (stampErr) console.error("cron affiliate-activation: comp stamp failed", { userId, stampErr });
      }
      if (sent) emailed += 1;
      continue;
    }

    if (day7Due) {
      if (dryRun) {
        wouldAct.push({ email, tier: "day7" });
        continue;
      }

      const hasCompQuota =
        typeof profile.affiliate_comp_monthly_quota === "number" &&
        profile.affiliate_comp_monthly_quota > 0;
      const { subject, text } = buildActivationDay7Email({ firstName, code, hasCompQuota });
      const sent = await sendAffiliateActivationEmail({ to: email, subject, text, tier: "day7" });
      if (!sent) {
        skipped += 1;
        continue; // no stamp -> retried next run
      }
      const { error: stampErr } = await supabase
        .from("affiliate_applications")
        .update({ activation_email_day7_sent_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (stampErr) console.error("cron affiliate-activation: day7 stamp failed", { userId, stampErr });
      emailed += 1;
      continue;
    }

    // Matured past 7d but both steps already sent, or not yet due.
    skipped += 1;
  }

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dryRun: true,
      eligible: wouldAct.length,
      day7: wouldAct.filter((w) => w.tier === "day7").length,
      comp: wouldAct.filter((w) => w.tier === "comp").length,
      considered: apps.length,
      list: wouldAct,
    });
  }

  return NextResponse.json({ ok: true, granted, emailed, skipped, considered: apps.length });
}
