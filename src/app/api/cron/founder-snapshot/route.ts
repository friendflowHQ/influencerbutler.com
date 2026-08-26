/**
 * Founder Snapshot cron.
 *
 * Mails the owner a live KPI digest on the 1st and 15th (vercel.json:
 * "0 14 1,15 * *"). Reuses the exact engines the admin dashboard uses, so the
 * email never drifts from the Growth page:
 *   - computeGrowthSnapshot()  -> subs, revenue, trials, affiliate + newsletter
 *     activity with month-over-month deltas.
 *   - loadAffiliateCommissions() -> producing vs dormant split + total owed.
 *   - fetchGaSummary()          -> last-28-day traffic + channels (best-effort).
 *
 * On the 1st the current month has almost no data, so we report the just-ended
 * month; on the 15th we report the current month to date. Each data source is
 * best-effort: a failure drops that section rather than the whole email.
 *
 * ?preview=1 returns the rendered HTML without sending. ?month=YYYY-MM and
 * ?to=<email> override the period/recipient for testing. Guarded by CRON_SECRET.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/admin";
import {
  computeGrowthSnapshot,
  monthKey,
  prevMonthKey,
  deltaPercent,
  type SnapshotClient,
  type MetricSnapshot,
} from "@/lib/growth-metrics";
import { fetchGaSummary } from "@/lib/ga4";
import { loadAffiliateCommissions } from "@/lib/affiliate-commissions-data";
import { sendEmail } from "@/lib/email-send";
import {
  buildFounderSnapshotEmail,
  formatMoneyCents,
  formatInt,
  type SnapshotKpi,
  type FounderSnapshotData,
} from "@/lib/founder-snapshot-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TO = "elizabethdean30@gmail.com";
const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("cron founder-snapshot: CRON_SECRET not set - refusing to execute");
    return false;
  }
  return (request.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

function monthLongLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function countKpi(label: string, metric: MetricSnapshot | undefined): SnapshotKpi {
  const cur = metric?.current ?? null;
  return {
    label,
    value: cur === null ? "n/a" : formatInt(cur),
    delta: deltaPercent(cur, metric?.previous ?? null),
  };
}

function moneyKpi(label: string, metric: MetricSnapshot | undefined): SnapshotKpi {
  const cur = metric?.current ?? null;
  return {
    label,
    value: cur === null ? "n/a" : formatMoneyCents(cur),
    delta: deltaPercent(cur, metric?.previous ?? null),
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const preview = url.searchParams.get("preview") === "1";
  const to = url.searchParams.get("to") || process.env.FOUNDER_SNAPSHOT_TO || DEFAULT_TO;

  const now = new Date();
  const thisMonth = monthKey(now);
  // On the 1st (or first week) the current month has no data yet, so report the
  // month that just ended; otherwise report the current month to date.
  const reportMonth =
    url.searchParams.get("month") || (now.getUTCDate() <= 7 ? prevMonthKey(thisMonth) : thisMonth);
  const isMonthToDate = reportMonth === thisMonth;
  const periodLabel = `${monthLongLabel(reportMonth)}${isMonthToDate ? " (month to date)" : ""}`;
  const generatedLabel = now.toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  const supabase = createAdminClient() as unknown as SnapshotClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const snapshot = await computeGrowthSnapshot(supabase, reportMonth);
  if (!snapshot) {
    return NextResponse.json({ error: "Snapshot unavailable" }, { status: 500 });
  }
  const m = snapshot.metrics;

  const kpis: SnapshotKpi[] = [
    countKpi("Active subscribers", m.active_subscriptions),
    countKpi("On trial now", m.on_trial_subscriptions),
    moneyKpi("Revenue", m.revenue_cents),
    countKpi("New subscriptions", m.new_subscriptions),
    countKpi("Trials started", m.trials_started),
    countKpi("Trial conversions", m.trial_conversions),
    countKpi("Affiliate applications", m.affiliate_signups),
    countKpi("Affiliate link clicks", m.affiliate_clicks),
    countKpi("Newsletter signups", m.email_subscribers),
    countKpi("New testimonials", m.testimonials),
  ];

  // Affiliate producing/dormant split + total owed (best-effort).
  let affiliates: FounderSnapshotData["affiliates"] = null;
  try {
    const commissions = await loadAffiliateCommissions({});
    if (commissions) {
      const statements = commissions.statements;
      const producing = statements.filter((s) => s.earnedCents > 0).length;
      const owedCents = statements.reduce((sum, s) => sum + s.owedCents + s.adjustmentCents, 0);
      affiliates = {
        total: statements.length,
        producing,
        dormant: Math.max(0, statements.length - producing),
        owedCents,
      };
    }
  } catch (err) {
    console.error("cron founder-snapshot: affiliate split failed", err);
  }

  // Traffic (best-effort; degrades to no section if GA is unconfigured/errors).
  let traffic: FounderSnapshotData["traffic"] = null;
  try {
    const ga = await fetchGaSummary();
    if (ga) {
      traffic = {
        activeUsers: ga.trend.totals.activeUsers,
        activeUsersDelta: deltaPercent(ga.trend.totals.activeUsers, ga.trend.prevTotals.activeUsers),
        newUsers: ga.trend.totals.newUsers,
        channels: ga.channels,
      };
    }
  } catch (err) {
    console.error("cron founder-snapshot: GA summary failed", err);
  }

  const { subject, html, text } = buildFounderSnapshotEmail({
    periodLabel,
    generatedLabel,
    kpis,
    affiliates,
    traffic,
  });

  if (preview) {
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }

  // Send PLAIN TEXT only (no html): Gmail silently spam-filters the heavy HTML
  // dashboard version, but delivers the plain-text version to the inbox. The
  // html is still built for ?preview=1 (a visual reference), just not emailed.
  const { ok, id } = await sendEmail({
    from: FROM_ADDRESS,
    to,
    subject,
    text,
    category: "founder_snapshot",
  });

  return NextResponse.json({ ok, id, to, month: reportMonth, subject });
}
