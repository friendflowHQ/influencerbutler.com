/**
 * GET  /api/admin/proof-metrics  -> current config + live public numbers
 * POST /api/admin/proof-metrics  -> update { enabled, baselines, labels }
 *
 * Lets an admin turn the homepage "proof of numbers" counter on/off and set a
 * credible baseline offset per metric without a deploy. Gated on activity.manage
 * (same family as the recent-activity widget). See src/lib/proof-metrics.ts.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import {
  readProofConfig,
  writeProofConfig,
  getPublicProofNumbers,
  PROOF_METRICS,
  type ProofConfig,
  type ProofMetricKey,
} from "@/lib/proof-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("activity.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [config, live] = await Promise.all([readProofConfig(), getPublicProofNumbers()]);
  return NextResponse.json({
    admin: { email: actor.email },
    config,
    live,
    metrics: PROOF_METRICS.map((m) => ({ key: m.key, defaultLabel: m.defaultLabel })),
  });
}

type ConfigBody = { enabled?: unknown; baselines?: unknown; labels?: unknown };

function clampBaseline(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(Math.round(n), 1_000_000_000);
}

export async function POST(request: Request) {
  const actor = await requirePermission("activity.manage", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let body: ConfigBody;
  try {
    body = (await request.json()) as ConfigBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const current = await readProofConfig();
  const inBaselines = (body.baselines && typeof body.baselines === "object"
    ? body.baselines
    : {}) as Record<string, unknown>;
  const inLabels = (body.labels && typeof body.labels === "object" ? body.labels : {}) as Record<
    string,
    unknown
  >;

  const baselines = { ...current.baselines };
  const labels: Partial<Record<ProofMetricKey, string>> = { ...current.labels };
  for (const def of PROOF_METRICS) {
    if (def.key in inBaselines) {
      baselines[def.key] = clampBaseline(inBaselines[def.key], current.baselines[def.key]);
    }
    if (def.key in inLabels) {
      const label = inLabels[def.key];
      if (typeof label === "string" && label.trim()) labels[def.key] = label.trim().slice(0, 60);
      else delete labels[def.key];
    }
  }

  const next: ProofConfig = {
    enabled: typeof body.enabled === "boolean" ? body.enabled : current.enabled,
    baselines,
    labels,
  };

  const ok = await writeProofConfig(next, actor.email);
  if (!ok) return NextResponse.json({ error: "Could not save" }, { status: 500 });

  await logAdminAction({
    actor,
    action: "activity.manage",
    targetType: "config",
    targetId: "proof_metrics",
    details: next,
  });

  return NextResponse.json({ ok: true, config: next });
}
