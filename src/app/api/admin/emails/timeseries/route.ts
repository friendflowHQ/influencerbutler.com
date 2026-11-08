/**
 * GET /api/admin/emails/timeseries
 *
 * Daily time-series of email engagement for the admin Emails dashboard: sends,
 * deliveries, opens, clicks, and bounces bucketed per day so the UI can draw
 * "over time" sparklines and trend charts. The point-in-time totals live in the
 * sibling summary endpoint; this one keeps the day dimension the summary throws
 * away.
 *
 * Scope (at most one, else all email):
 *   ?category=<exact>     one sequence step (seq_<id8>_s<n>) or campaign (campaign_<id8>)
 *   ?prefix=<seq_<id8>>   a whole sequence (all its steps)
 *   ?broadcastId=<id>     one newsletter issue
 *   ?funnel=<name>        a whole funnel (roll-up)
 *   ?days=7|30|90         window length (default 30)
 *
 * We fetch a double-length window (2 * days) so the response can carry a delta
 * vs the immediately prior window, the same trick the Growth dashboard uses.
 * Counted per UTC day in Postgres by public.email_sends_daily
 * (20261111_email_sends_rollups.sql); until that migration is applied the
 * route falls back to scanning rows and bucketing in JS, capped at MAX_ROWS.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError } from "@/lib/extension-api";
import { isMissingFunctionError, scanNewestFirst } from "@/lib/email-sends-scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DAYS = new Set([7, 30, 90]);
const BATCH = 1000;
// Defensive ceiling so an unscoped 180-day sweep can never page forever. At our
// volume the real row counts are far below this; hitting it flags `truncated`.
const MAX_ROWS = 60_000;

const DAY_MS = 24 * 60 * 60 * 1000;

type Metric = "sent" | "delivered" | "opened" | "clicked" | "bounced";

export type TrendPoint = {
  date: string; // YYYY-MM-DD (UTC)
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
};

export type TrendTotals = Record<Metric, number>;

type SendRow = {
  created_at: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
};

function blankTotals(): TrendTotals {
  return { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 };
}

/** UTC day key (YYYY-MM-DD) for an ISO timestamp, or null when unparseable. */
function dayKey(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
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

  const category = url.searchParams.get("category")?.trim() || null;
  const prefix = url.searchParams.get("prefix")?.trim() || null;
  const broadcastId = url.searchParams.get("broadcastId")?.trim() || null;
  const funnel = url.searchParams.get("funnel")?.trim() || null;

  // Start of the window that includes the prior period (for the delta). Anchor
  // both windows to UTC midnight so bucket boundaries line up with the day keys.
  const now = Date.now();
  const windowStart = now - 2 * days * DAY_MS;
  const cutoff = new Date(windowStart).toISOString();

  // Build the continuous list of day keys, oldest first, across both windows.
  // The last `days` entries are the current window; the `days` before that are
  // the prior window used only for the delta.
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const dayList: string[] = [];
  {
    const startKey = new Date(windowStart).toISOString().slice(0, 10);
    let cursor = Date.parse(`${startKey}T00:00:00.000Z`);
    const end = Date.parse(`${todayKey}T00:00:00.000Z`);
    while (cursor <= end) {
      dayList.push(new Date(cursor).toISOString().slice(0, 10));
      cursor += DAY_MS;
    }
  }
  const index = new Map<string, TrendPoint>();
  for (const date of dayList) {
    index.set(date, { date, sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0 });
  }

  // Fast path: per-day counts grouped in Postgres
  // (20261111_email_sends_rollups.sql), no row cap.
  const rollup = await db
    .rpc("email_sends_daily", {
      p_since: cutoff,
      p_category: category,
      p_prefix: prefix,
      p_broadcast_id: broadcastId,
      p_funnel: funnel,
    });
  let error: { code?: string; message?: string } | null = rollup.error;
  let truncated = false;
  if (!error) {
    for (const row of (rollup.data ?? []) as Array<{ day: string } & TrendTotals>) {
      const point = index.get(row.day);
      if (!point) continue;
      for (const metric of ["sent", "delivered", "opened", "clicked", "bounced"] as const) {
        point[metric] += Number(row[metric]) || 0;
      }
    }
  }

  // Migration not applied yet: newest-first row scan without OFFSET (see
  // scanNewestFirst), capped at MAX_ROWS. Every query carries the same scope.
  const cols = "created_at, delivered_at, opened_at, clicked_at, bounced_at";
  // At most one scope filter is expected; apply whichever was passed.
  const scope: { col: string; op: "eq" | "like"; value: string } | null = category
    ? { col: "category", op: "eq", value: category }
    : prefix
      ? { col: "category", op: "like", value: `${prefix}%` }
      : broadcastId
        ? { col: "broadcast_id", op: "eq", value: broadcastId }
        : funnel
          ? { col: "funnel", op: "eq", value: funnel }
          : null;
  if (error && isMissingFunctionError(error)) ({ error, truncated } = await scanNewestFirst<SendRow>(
    (before, limit) => {
      let q = db.from("email_sends").select(cols).gte("created_at", cutoff);
      if (scope) q = scope.op === "eq" ? q.eq(scope.col, scope.value) : q.like(scope.col, scope.value);
      if (before) q = q.lt("created_at", before);
      return q.order("created_at", { ascending: false }).limit(limit).returns<SendRow[]>();
    },
    (at, from, to) => {
      let q = db.from("email_sends").select(cols).eq("created_at", at);
      if (scope) q = scope.op === "eq" ? q.eq(scope.col, scope.value) : q.like(scope.col, scope.value);
      return q.order("id").range(from, to).returns<SendRow[]>();
    },
    (rows) => {
      for (const row of rows) {
        // Each event counts on the day it occurred, when that day is in-window.
        const bumps: Array<[string | null, Metric]> = [
          [dayKey(row.created_at), "sent"],
          [dayKey(row.delivered_at), "delivered"],
          [dayKey(row.opened_at), "opened"],
          [dayKey(row.clicked_at), "clicked"],
          [dayKey(row.bounced_at), "bounced"],
        ];
        for (const [key, metric] of bumps) {
          if (!key) continue;
          const point = index.get(key);
          if (point) point[metric] += 1;
        }
      }
    },
    { batch: BATCH, maxRows: MAX_ROWS },
  ));
  if (error) {
    console.error("admin emails/timeseries: query failed", error);
    return NextResponse.json({
      days,
      from: dayList[dayList.length - days] ?? todayKey,
      to: todayKey,
      points: [],
      totals: blankTotals(),
      prevTotals: blankTotals(),
      migrationPending: isMissingTableError(error),
      loadError: !isMissingTableError(error),
    });
  }

  // Split into current (last `days`) and prior (`days` before that) windows.
  const ordered = dayList.map((d) => index.get(d)!);
  const currentPoints = ordered.slice(-days);
  const priorPoints = ordered.slice(-2 * days, -days);

  const totals = blankTotals();
  for (const p of currentPoints) {
    totals.sent += p.sent;
    totals.delivered += p.delivered;
    totals.opened += p.opened;
    totals.clicked += p.clicked;
    totals.bounced += p.bounced;
  }
  const prevTotals = blankTotals();
  for (const p of priorPoints) {
    prevTotals.sent += p.sent;
    prevTotals.delivered += p.delivered;
    prevTotals.opened += p.opened;
    prevTotals.clicked += p.clicked;
    prevTotals.bounced += p.bounced;
  }

  return NextResponse.json({
    days,
    from: currentPoints[0]?.date ?? todayKey,
    to: currentPoints[currentPoints.length - 1]?.date ?? todayKey,
    points: currentPoints,
    totals,
    prevTotals,
    truncated,
    migrationPending: false,
  });
}
