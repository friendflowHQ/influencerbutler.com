/**
 * GET /api/admin/cancellations
 *
 * Returns the collected cancellation-survey answers (reason, buying intent,
 * would-return, free text) plus aggregate breakdowns and the coverage gap:
 * how many ended subscriptions left no reason at all. Gated by reports.view
 * (same permission as the admin Overview and Growth pages).
 *
 * The underlying table's RLS only lets a user read their own row, so this must
 * read via the service-role client (inside the lib helpers).
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import {
  listCancellations,
  loadCancellationDashboard,
  countUnsurveyedEndedSubs,
  REASONS,
  WOULD_RETURN_OPTIONS,
} from "@/lib/cancel-reasons";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [rows, unsurveyed, dashboard] = await Promise.all([
    listCancellations(200),
    countUnsurveyedEndedSubs(),
    loadCancellationDashboard(300),
  ]);

  // Only count completed answers in the breakdowns so an unanswered emailed
  // survey (a pending row) does not inflate a reason bucket.
  const answered = rows.filter((r) => r.completed);

  const reasonCounts: Record<string, number> = {};
  for (const r of REASONS) reasonCounts[r.value] = 0;
  const wouldReturnCounts: Record<string, number> = {};
  for (const o of WOULD_RETURN_OPTIONS) wouldReturnCounts[o.value] = 0;

  for (const row of answered) {
    if (row.reason in reasonCounts) reasonCounts[row.reason] += 1;
    else reasonCounts[row.reason] = (reasonCounts[row.reason] ?? 0) + 1;
    if (row.wouldReturn && row.wouldReturn in wouldReturnCounts) {
      wouldReturnCounts[row.wouldReturn] += 1;
    }
  }

  const emailPending = rows.filter((r) => r.source === "email" && !r.completed).length;

  return NextResponse.json({
    admin: { email: actor.email },
    rows,
    dashboard,
    summary: {
      total: rows.length,
      answered: answered.length,
      emailPending,
      unsurveyedEnded: unsurveyed,
      reasonCounts,
      wouldReturnCounts,
    },
    labels: {
      reasons: REASONS,
      wouldReturn: WOULD_RETURN_OPTIONS,
    },
  });
}
