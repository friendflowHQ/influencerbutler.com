/**
 * GET /api/admin/emails/summary?days=30
 *
 * Aggregate email metrics per category (and rolled up per funnel) over a
 * recent window: sent, suppressed skips, failures, delivered, opened, clicked,
 * bounced, complained. Counted in Postgres by public.email_sends_summary
 * (20261111_email_sends_rollups.sql); until that migration is applied the
 * route falls back to scanning rows out of email_sends and counting in JS,
 * which takes 10-30s at 100k+ sends a month.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isResendWebhookConfigured } from "@/lib/resend-webhook-secret";
import { isMissingTableError } from "@/lib/extension-api";
import { isMissingFunctionError, scanNewestFirst } from "@/lib/email-sends-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DAYS = new Set([7, 30, 90]);
const BATCH = 1000;

// Health of the open/click tracking pipeline, so the dashboard can distinguish
// "nobody opened it" from "opens are not being recorded at all". A dark
// pipeline reads as a bare 0% otherwise, which looks like real (terrible)
// engagement. See src/app/api/webhooks/resend/route.ts for what writes opens.
export type TrackingStatus =
  | "ok"
  | "no_data" // nothing sent in-window; nothing to diagnose
  | "no_secret" // webhook fails closed with no signing secret: cannot record
  | "no_events" // sends exist but zero delivered/opened/clicked: webhook likely not wired
  | "no_engagement_tracking" // deliveries land but no opens/clicks: Resend domain tracking off
  | "clicks_untracked"; // opens record but zero clicks over real volume: email.clicked not subscribed

// Enough opens to make "zero clicks" statistically implausible rather than a
// quiet audience. Below this we stay silent to avoid false alarms on tiny sends.
const CLICK_ALARM_MIN_OPENS = 20;

export type TrackingHealth = {
  webhookConfigured: boolean;
  status: TrackingStatus;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
};

export type EmailAggregate = {
  key: string;
  funnel: string;
  sent: number;
  suppressed: number;
  failed: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  complained: number;
};

type SendRow = {
  created_at: string;
  category: string;
  funnel: string;
  status: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
};

type Counts = Omit<EmailAggregate, "key" | "funnel">;

// One row of public.email_sends_summary (already grouped in Postgres).
type RollupRow = Counts & { category: string; funnel: string };

// Counting rules for a single row; the SQL rollup mirrors these exactly.
function rowCounts(row: SendRow): Counts {
  return {
    sent: row.status !== "suppressed" && row.status !== "failed" ? 1 : 0,
    suppressed: row.status === "suppressed" ? 1 : 0,
    failed: row.status === "failed" ? 1 : 0,
    delivered: row.delivered_at ? 1 : 0,
    opened: row.opened_at ? 1 : 0,
    clicked: row.clicked_at ? 1 : 0,
    bounced: row.bounced_at ? 1 : 0,
    complained: row.complained_at ? 1 : 0,
  };
}

function addCounts(agg: EmailAggregate, c: Counts) {
  agg.sent += Number(c.sent) || 0;
  agg.suppressed += Number(c.suppressed) || 0;
  agg.failed += Number(c.failed) || 0;
  agg.delivered += Number(c.delivered) || 0;
  agg.opened += Number(c.opened) || 0;
  agg.clicked += Number(c.clicked) || 0;
  agg.bounced += Number(c.bounced) || 0;
  agg.complained += Number(c.complained) || 0;
}

function blank(key: string, funnel: string): EmailAggregate {
  return {
    key,
    funnel,
    sent: 0,
    suppressed: 0,
    failed: 0,
    delivered: 0,
    opened: 0,
    clicked: 0,
    bounced: 0,
    complained: 0,
  };
}

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let db;
  try {
    db = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = ALLOWED_DAYS.has(daysRaw) ? daysRaw : 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const byCategory = new Map<string, EmailAggregate>();
  const byFunnel = new Map<string, EmailAggregate>();

  const add = (key: string, funnel: string, counts: Counts) => {
    let cat = byCategory.get(key);
    if (!cat) byCategory.set(key, (cat = blank(key, funnel)));
    addCounts(cat, counts);
    let fun = byFunnel.get(funnel);
    if (!fun) byFunnel.set(funnel, (fun = blank(funnel, funnel)));
    addCounts(fun, counts);
  };

  // Fast path: one GROUP BY in Postgres (20261111_email_sends_rollups.sql).
  const rollup = await db.rpc("email_sends_summary", { p_since: cutoff });
  let error: { code?: string; message?: string } | null = rollup.error;
  if (!error) {
    for (const row of (rollup.data ?? []) as RollupRow[]) add(row.category, row.funnel, row);
  } else if (isMissingFunctionError(error)) {
    // Migration not applied yet: newest-first row scan without OFFSET (see
    // scanNewestFirst). Slow on 100k+ row windows but correct.
    const cols = "created_at, category, funnel, status, delivered_at, opened_at, clicked_at, bounced_at, complained_at";
    ({ error } = await scanNewestFirst<SendRow>(
      (before, limit) => {
        let q = db.from("email_sends").select(cols).gte("created_at", cutoff);
        if (before) q = q.lt("created_at", before);
        return q.order("created_at", { ascending: false }).limit(limit).returns<SendRow[]>();
      },
      (at, from, to) =>
        db.from("email_sends").select(cols).eq("created_at", at).order("id").range(from, to).returns<SendRow[]>(),
      (rows) => {
        for (const row of rows) add(row.category || "unknown", row.funnel || "transactional", rowCounts(row));
      },
      { batch: BATCH },
    ));
  }
  if (error) {
    console.error("admin emails/summary: query failed", error);
    // Only a genuinely absent table means "apply the migration". Anything
    // else (usually a statement timeout) is a transient load failure.
    return NextResponse.json(
      isMissingTableError(error)
        ? { days, categories: [], funnels: [], migrationPending: true }
        : { days, categories: [], funnels: [], loadError: true },
    );
  }

  const sortDesc = (a: EmailAggregate, b: EmailAggregate) =>
    b.sent + b.suppressed + b.failed - (a.sent + a.suppressed + a.failed);

  const totals = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
  for (const c of byCategory.values()) {
    totals.sent += c.sent;
    totals.delivered += c.delivered;
    totals.opened += c.opened;
    totals.clicked += c.clicked;
  }

  const webhookConfigured = await isResendWebhookConfigured();
  let status: TrackingStatus;
  if (totals.sent === 0) status = "no_data";
  else if (!webhookConfigured) status = "no_secret";
  else if (totals.delivered === 0 && totals.opened === 0 && totals.clicked === 0) status = "no_events";
  else if (totals.opened === 0 && totals.clicked === 0) status = "no_engagement_tracking";
  else if (totals.clicked === 0 && totals.opened >= CLICK_ALARM_MIN_OPENS) status = "clicks_untracked";
  else status = "ok";

  const tracking: TrackingHealth = { webhookConfigured, status, ...totals };

  return NextResponse.json({
    days,
    categories: [...byCategory.values()].sort(sortDesc),
    funnels: [...byFunnel.values()].sort(sortDesc),
    migrationPending: false,
    tracking,
  });
}
