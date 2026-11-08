/**
 * GET /api/admin/emails/funnels
 *
 * Funnel conversion counts for the email drip sequences, computed from the
 * per-funnel sent-at / converted-at columns that already exist on business
 * tables. Because those columns predate the email_sends log, this view covers
 * ALL history, not just sends since the analytics deploy. Each funnel also
 * carries its Funnels v2 goal metrics (activation % and paid % over a matured
 * cohort, from src/lib/funnel-metrics.ts) against its target.
 *
 * Each funnel is best-effort: a failed query (e.g. migration not applied)
 * nulls that number instead of failing the page.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeFunnelMetrics, countFunnelTotals, type FunnelMetrics } from "@/lib/funnel-metrics";
import { getFunnelTargets, systemTargetKey, targetFor } from "@/lib/funnel-targets";
import type { FunnelKey } from "@/lib/funnel-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MetricWithTarget = FunnelMetrics["activation"] & { target: number };

export type FunnelStats = {
  key: string;
  label: string;
  enteredLabel: string;
  convertedLabel: string | null;
  entered: number;
  converted: number | null;
  metrics: {
    activation: MetricWithTarget;
    paid: FunnelMetrics["paid"] & { target: number };
  };
};

const FUNNELS: { key: FunnelKey; label: string; enteredLabel: string }[] = [
  { key: "trial", label: "Trial drip", enteredLabel: "trials emailed" },
  { key: "apptrial", label: "App trial", enteredLabel: "app trials emailed" },
  { key: "onboarding", label: "Free onboarding", enteredLabel: "downloads emailed" },
  { key: "winback", label: "Win-back", enteredLabel: "churned emailed" },
  { key: "conversion", label: "Affiliate conversion", enteredLabel: "affiliates emailed" },
];

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

  const now = Date.now();
  const targets = await getFunnelTargets(db);

  const funnels: FunnelStats[] = await Promise.all(
    FUNNELS.map(async (f) => {
      const [totals, metrics] = await Promise.all([
        countFunnelTotals(db, f.key),
        computeFunnelMetrics(db, f.key, now),
      ]);
      const target = targetFor(targets, systemTargetKey(f.key));
      return {
        key: f.key,
        label: f.label,
        enteredLabel: f.enteredLabel,
        convertedLabel: totals.convertedLabel,
        entered: totals.entered ?? 0,
        converted: totals.converted,
        metrics: {
          activation: { ...metrics.activation, target: target.activation },
          paid: { ...metrics.paid, target: target.paid },
        },
      };
    }),
  );

  return NextResponse.json({ funnels });
}
