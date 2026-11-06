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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Totals = { commissionCents: number; grossCents: number; sellers: number; salesCount: number };
type SeriesPoint = { bucket: string; commissionCents: number; grossCents: number };

function monthBounds(month: string): { from: number; to: number; days: string[] } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const from = Date.UTC(y, mo, 1);
  const to = Date.UTC(y, mo + 1, 1);
  const days: string[] = [];
  for (let t = from; t < to; t += 24 * 60 * 60 * 1000) days.push(new Date(t).toISOString().slice(0, 10));
  return { from, to, days };
}

async function summaryFor(from: number, to: number) {
  return callLinksAdmin<{ current: Totals; series: SeriesPoint[] }>("/admin/commerce/summary", {
    query: { from, to, bucket: "day" },
  });
}

export async function GET(request: Request) {
  const actor = await requirePermission("finance.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const month = new URL(request.url).searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const cur = monthBounds(month);
  if (!cur) return NextResponse.json({ error: "Bad month" }, { status: 400 });
  const prevStart = new Date(cur.from);
  prevStart.setUTCMonth(prevStart.getUTCMonth() - 1);
  const prev = { from: prevStart.getTime(), to: cur.from };

  const [a, b] = await Promise.all([summaryFor(cur.from, Math.min(cur.to, Date.now() + 1)), summaryFor(prev.from, prev.to)]);
  if (!a.ok) return NextResponse.json({ error: a.error }, { status: a.status === 503 ? 503 : 502 });
  const byDay = new Map((a.data.series ?? []).map((p) => [p.bucket, p]));
  const series = cur.days.filter((d) => Date.parse(`${d}T00:00:00Z`) <= Date.now()).map((d) => byDay.get(d)?.commissionCents ?? 0);
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
