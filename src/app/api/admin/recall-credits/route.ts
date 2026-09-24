/**
 * GET /api/admin/recall-credits
 * Cheap read of the last-known Recall.ai recording-credit status (from app_config,
 * refreshed by the recall-credit-check cron and by manual retries) so the admin
 * Events page can warn "recording credits are out" without doing a live probe on
 * every load. Pass ?refresh=1 to force a live check now (creates + removes one
 * throwaway bot when credit is healthy; costs nothing when it is not). Gated by
 * events.manage.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { checkRecallCredits } from "@/lib/recall";
import { getRecallCreditStatus, recordRecallCreditCheck } from "@/lib/recall-credit-alert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("events.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  if (refresh) {
    const status = await checkRecallCredits();
    await recordRecallCreditCheck(status);
  }

  const status = await getRecallCreditStatus();
  return NextResponse.json({ status });
}
