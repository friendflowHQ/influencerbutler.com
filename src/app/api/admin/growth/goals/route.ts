/**
 * Growth goals API.
 *
 * GET  /api/admin/growth/goals?month=YYYY-MM
 *   Ensures this month's auto-suggestions exist (current month only), stamps
 *   freshly-achieved goals, and returns the month's goals with live progress.
 *
 * PATCH /api/admin/growth/goals
 *   { id, action: "accept" | "dismiss" | "set_target" | "celebrated", target? }
 *   "celebrated" stamps celebrated_at so the confetti fires exactly once;
 *   "set_target" resets achievement state so the new target re-evaluates.
 *
 * Depends on the 20260705_growth_dashboard migration; until it is applied in
 * prod the responses carry migrationPending: true.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { computeGrowthSnapshot, monthKey, type SnapshotClient } from "@/lib/growth-metrics";
import {
  ensureSuggestions,
  loadGoalsWithAchievements,
  isMissingTable,
  type GoalsClient,
} from "@/lib/growth-goals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  const snapClient = supabase as unknown as SnapshotClient;
  const goalsClient = supabase as unknown as GoalsClient;

  const url = new URL(request.url);
  const currentMonth = monthKey(new Date());
  const month = url.searchParams.get("month") ?? currentMonth;

  const snapshot = await computeGrowthSnapshot(snapClient, month);
  if (!snapshot) {
    return NextResponse.json({ error: "Invalid month" }, { status: 400 });
  }

  let migrationPending = false;
  // Only auto-suggest for the live month; browsing history should not
  // backfill goals into old months.
  if (month === currentMonth) {
    const res = await ensureSuggestions(goalsClient, month, snapshot);
    migrationPending = migrationPending || res.migrationPending;
  }

  const loaded = await loadGoalsWithAchievements(goalsClient, month, snapshot);
  migrationPending = migrationPending || loaded.migrationPending;

  return NextResponse.json({
    admin: { email: actor.email },
    month,
    migrationPending,
    goals: loaded.goals ?? [],
  });
}

type UpdateClient = {
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (
        col: string,
        value: string,
      ) => Promise<{ error: { message?: string; code?: string } | null }>;
    };
  };
};

export async function PATCH(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient() as unknown as UpdateClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let body: { id?: unknown; action?: unknown; target?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = typeof body.id === "string" ? body.id : null;
  const action = typeof body.action === "string" ? body.action : null;
  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  let values: Record<string, unknown> | null = null;

  if (action === "accept") {
    values = { status: "accepted", updated_at: nowIso };
  } else if (action === "dismiss") {
    values = { status: "dismissed", updated_at: nowIso };
  } else if (action === "set_target") {
    const target = Number(body.target);
    if (!Number.isFinite(target) || target <= 0) {
      return NextResponse.json({ error: "target must be a positive number" }, { status: 400 });
    }
    // New target, fresh race: achievement re-stamps on the next GET if met.
    values = {
      target,
      status: "accepted",
      achieved_at: null,
      celebrated_at: null,
      updated_at: nowIso,
    };
  } else if (action === "celebrated") {
    values = { celebrated_at: nowIso, updated_at: nowIso };
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { error } = await supabase.from("growth_goals").update(values).eq("id", id);
  if (error) {
    if (isMissingTable(error)) {
      return NextResponse.json({ error: "Migration pending", migrationPending: true }, { status: 409 });
    }
    console.error("growth goals: update failed", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
