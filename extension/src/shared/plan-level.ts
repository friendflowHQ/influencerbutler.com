// Plan LEVEL (Beginner / Power User / legacy), published by the desktop app over
// the local bridge status frame and by /api/extension/auth/check. Mirrors the
// desktop catalog (InfluencerButler/src/shared/plan-catalog.js):
//   beginner = the starter butlers, AI included on our key, no 1:1 calls;
//              the popup shows the one-click upgrade line.
//   power    = everything, own OpenAI key, 1:1 calls.
//   legacy   = every customer from before the split (the default, and today's
//              behavior): nothing in the extension changes for them.

export type PlanLevel = "beginner" | "power" | "legacy";

export const DEFAULT_PLAN_LEVEL: PlanLevel = "legacy";

export function normalizePlanLevel(value: unknown): PlanLevel {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "beginner" || v === "power" ? v : DEFAULT_PLAN_LEVEL;
}

export function isBeginnerPlan(value: unknown): boolean {
  return normalizePlanLevel(value) === "beginner";
}
