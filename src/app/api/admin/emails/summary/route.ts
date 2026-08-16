/**
 * GET /api/admin/emails/summary?days=30
 *
 * Aggregate email metrics per category (and rolled up per funnel) over a
 * recent window: sent, suppressed skips, failures, delivered, opened, clicked,
 * bounced, complained. Rows are paged out of email_sends and aggregated in JS;
 * volume is modest (drip funnels over a small user base), and a SQL view is
 * the upgrade path if that ever changes.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_DAYS = new Set([7, 30, 90]);
const BATCH = 1000;

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
  category: string;
  funnel: string;
  status: string;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
};

function bump(agg: EmailAggregate, row: SendRow) {
  if (row.status === "suppressed") agg.suppressed += 1;
  else if (row.status === "failed") agg.failed += 1;
  else agg.sent += 1;
  if (row.delivered_at) agg.delivered += 1;
  if (row.opened_at) agg.opened += 1;
  if (row.clicked_at) agg.clicked += 1;
  if (row.bounced_at) agg.bounced += 1;
  if (row.complained_at) agg.complained += 1;
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

  let offset = 0;
  for (;;) {
    const { data, error } = await db
      .from("email_sends")
      .select("category, funnel, status, delivered_at, opened_at, clicked_at, bounced_at, complained_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .range(offset, offset + BATCH - 1);
    if (error) {
      console.error("admin emails/summary: query failed", error);
      return NextResponse.json({ days, categories: [], funnels: [], migrationPending: true });
    }
    const rows = (data ?? []) as SendRow[];
    for (const row of rows) {
      const catKey = row.category || "unknown";
      let cat = byCategory.get(catKey);
      if (!cat) byCategory.set(catKey, (cat = blank(catKey, row.funnel || "transactional")));
      bump(cat, row);

      const funKey = row.funnel || "transactional";
      let fun = byFunnel.get(funKey);
      if (!fun) byFunnel.set(funKey, (fun = blank(funKey, funKey)));
      bump(fun, row);
    }
    if (rows.length < BATCH) break;
    offset += BATCH;
  }

  const sortDesc = (a: EmailAggregate, b: EmailAggregate) =>
    b.sent + b.suppressed + b.failed - (a.sent + a.suppressed + a.failed);

  return NextResponse.json({
    days,
    categories: [...byCategory.values()].sort(sortDesc),
    funnels: [...byFunnel.values()].sort(sortDesc),
    migrationPending: false,
  });
}
