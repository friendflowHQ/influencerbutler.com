import { ENDPOINTS } from "../shared/constants";
import { normalizePlanLevel, type PlanLevel } from "../shared/plan-level";
import { getState, patchState } from "../storage/store";
import type { PlanOptionsResult, PlanUpgradeResult } from "../shared/messages";

// Beginner -> Power User from the popup. Both calls go through the site's
// /api/extension/plan, which forwards the license key to the licensing Worker
// (the same plan-options / change-plan paths the desktop app uses). The
// extension never sees a Lemon Squeezy id; it only learns the price to show
// and whether the switch went through.

async function licenseKey(): Promise<string | null> {
  return (await getState()).auth.licenseKey;
}

export async function getPlanOptions(): Promise<PlanOptionsResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "not_signed_in" };
  try {
    const res = await fetch(ENDPOINTS.plan, { headers: { Authorization: `Bearer ${key}` } });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !data || data.ok !== true) {
      return { ok: false, error: String((data && data.error) || `http_${res.status}`) };
    }
    const current = (data.current as Record<string, unknown>) || {};
    const upgrade = (data.upgrade as Record<string, unknown>) || null;
    const change = (data.priceChange as Record<string, unknown>) || null;
    const level = normalizePlanLevel(current.level);
    // Remember the level the Worker just confirmed so the popup can render it
    // synchronously next time.
    await rememberPlanLevel(level);
    return {
      ok: true,
      level,
      upgrade: upgrade && typeof upgrade.priceCents === "number"
        ? { priceCents: upgrade.priceCents as number, interval: String(upgrade.interval || "month") }
        : null,
      priceChange: change && typeof change.upgrade === "number" && typeof change.effectiveAt === "string"
        ? { upgradeCents: change.upgrade as number, effectiveAt: change.effectiveAt as string }
        : null,
    };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function upgradePlan(): Promise<PlanUpgradeResult> {
  const key = await licenseKey();
  if (!key) return { ok: false, error: "not_signed_in" };
  try {
    const res = await fetch(ENDPOINTS.plan, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ target: "power" }),
    });
    const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || !data || data.ok !== true) {
      return { ok: false, error: String((data && data.error) || `http_${res.status}`) };
    }
    await rememberPlanLevel("power");
    return { ok: true, level: "power" };
  } catch {
    return { ok: false, error: "network" };
  }
}

/** Store the plan level on the auth record (null-safe; never throws). */
export async function rememberPlanLevel(level: unknown): Promise<void> {
  const normalized: PlanLevel = normalizePlanLevel(level);
  try {
    await patchState((state) => {
      if (state.auth.planLevel !== normalized) state.auth.planLevel = normalized;
    });
  } catch {
    // storage may be unavailable; the next popup open re-learns it
  }
}
