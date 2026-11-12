/**
 * GET /api/admin/growth/foyer?month=YYYY-MM
 *
 * Foyer commerce growth for the Growth page: our commission, sales processed
 * and creators selling for one month vs the month before, with a daily
 * commission series for the sparkline. Totals only (no buyer detail), so it
 * needs finance.view but not the Finance step-up code.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { callLinksAdmin } from "@/lib/links-admin";
import { DEFAULT_TIMEZONE, currentMonthKey, localDateStr, zonedTimeToUtc } from "@/lib/timezone";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Totals = { commissionCents: number; grossCents: number; sellers: number; salesCount: number };
type SeriesPoint = { bucket: string; commissionCents: number; grossCents: number };

/**
 * The business-timezone (America/Denver) calendar month, as epoch-ms bounds,
 * the same month edges the rest of the Growth page uses. `days` lists its
 * local dates, 'YYYY-MM-DD'.
 */
function monthBounds(month: string): { from: number; to: number; days: string[] } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const from = zonedTimeToUtc(y, mo, 1, 0, DEFAULT_TIMEZONE).getTime();
  const to = zonedTimeToUtc(mo === 12 ? y + 1 : y, mo === 12 ? 1 : mo + 1, 1, 0, DEFAULT_TIMEZONE).getTime();
  const dayCount = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const days: string[] = [];
  for (let d = 1; d <= dayCount; d++) days.push(`${m[1]}-${m[2]}-${String(d).padStart(2, "0")}`);
  return { from, to, days };
}

function prevMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

async function summaryFor(from: number, to: number) {
  return callLinksAdmin<{ current: Totals; series: SeriesPoint[] }>("/admin/commerce/summary", {
    query: { from, to, bucket: "day" },
  });
}

export async function GET(request: Request) {
  const actor = await requirePermission("finance.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = Date.now();
  const month = new URL(request.url).searchParams.get("month") ?? currentMonthKey(new Date(now));
  const cur = monthBounds(month);
  if (!cur) return NextResponse.json({ error: "Bad month" }, { status: 400 });
  const prevBounds = monthBounds(prevMonth(month));
  if (!prevBounds) return NextResponse.json({ error: "Bad month" }, { status: 400 });

  const [a, b] = await Promise.all([
    summaryFor(cur.from, Math.min(cur.to, now + 1)),
    summaryFor(prevBounds.from, prevBounds.to),
  ]);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status === 503 ? 503 : 502 });

  // The links Worker buckets the daily series by UTC date. The window is now the
  // Denver month, so the UTC date just past the month's end (the last evening
  // in Denver is already the 1st in UTC) is folded into the last day, and
  // anything before the 1st into the first day.
  const byDay = new Map<string, number>();
  const first = cur.days[0];
  const last = cur.days[cur.days.length - 1];
  for (const p of a.data.series ?? []) {
    const key = p.bucket < first ? first : p.bucket > last ? last : p.bucket;
    byDay.set(key, (byDay.get(key) ?? 0) + (p.commissionCents ?? 0));
  }
  const today = localDateStr(new Date(now), DEFAULT_TIMEZONE);
  const series = cur.days.filter((d) => d <= today).map((d) => byDay.get(d) ?? 0);
  const p = b.ok ? b.data.current : null;
  return NextResponse.json({
    ok: true,
    month,
    commission: { current: a.data.current.commissionCents, previous: p ? p.commissionCents : null, series },
    gross: { current: a.data.current.grossCents, previous: p ? p.grossCents : null },
    sellers: { current: a.data.current.sellers, previous: p ? p.sellers : null },
    sales: { current: a.data.current.salesCount, previous: p ? p.salesCount : null },
  });
}
