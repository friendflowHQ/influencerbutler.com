// Funnels v2: one place that decides a person's plan level (Beginner, Power
// User, or a pre-split "legacy" plan) and keeps it on email_subscribers as the
// `plan_level` / `plan_level_source` columns plus one managed `plan-*` tag.
//
// Source rank, highest first (PLAN_LEVEL_SOURCE_RANK):
//   ls        the live Lemon Squeezy variant (planLevelForVariantId)
//   comp      a comp / no-card grant's plan string (levelForPlan)
//   intent    the plan the desktop app says the person picked (planLevelIntent)
//   inferred  walkthrough answers (brand-new / beginner-start read as beginner)
// A write from a lower-ranked source never replaces a higher-ranked one; the
// same source always replaces (a real downgrade is still an `ls` write).
//
// The plan- tag is managed: it is replaced, not unioned, and never fires
// enrollForTagAdded. `legacy` reads as power for copy (planBaseForLevel).
//
// Columns come from 20261109_funnels_v2_data.sql (hand-applied). Without them
// only the tag is written, and only when it cannot clobber a better source.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PLAN_LEVEL_SOURCE_RANK,
  PLAN_LEVEL_VALUES,
  PLAN_TAG_PREFIX,
  PLAN_TAGS,
  type OnboardingProfile,
  type PlanLevelSource,
  type PlanLevelValue,
} from "@/lib/funnel-types";
import { planForVariantId, planLevelForVariantId } from "@/lib/lemonsqueezy";
import { levelForPlan } from "@/lib/pricing-constants";
import { replaceManagedTags } from "@/lib/onboarding-profile";
import { isMissingSchemaError, normalizeFunnelEmail, supersedeAppTrial } from "@/lib/funnel-assignments";

export type ResolvedPlanLevel = { level: PlanLevelValue; source: PlanLevelSource };

/** 0 = highest rank. Unknown / null sources rank below everything. */
export function planSourceRank(source: string | null | undefined): number {
  const i = (PLAN_LEVEL_SOURCE_RANK as readonly string[]).indexOf(String(source ?? ""));
  return i === -1 ? PLAN_LEVEL_SOURCE_RANK.length : i;
}

/** True when a write from `next` may replace what is stored from `current`. */
export function canReplacePlanSource(
  current: string | null | undefined,
  next: PlanLevelSource,
): boolean {
  return planSourceRank(next) <= planSourceRank(current);
}

export function isPlanLevelValue(v: unknown): v is PlanLevelValue {
  return typeof v === "string" && (PLAN_LEVEL_VALUES as readonly string[]).includes(v);
}

/**
 * Normalizes the desktop's planLevelIntent. Accepts the level words and the
 * display names ("Power User", "pro"); anything else is null.
 */
export function normalizePlanLevelIntent(raw: unknown): PlanLevelValue | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (v === "beginner") return "beginner";
  if (v === "power" || v === "power-user" || v === "pro") return "power";
  if (v === "legacy") return "legacy";
  return null;
}

function isAddonVariant(variantId: string | number | null | undefined): boolean {
  const addon = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON;
  return !!addon && variantId != null && String(variantId) === String(addon);
}

export type PlanLevelInput = {
  /** Variant of the person's live (non add-on) LS subscription. */
  lsVariantId?: string | number | null;
  /** Plan string of a live comp grant, e.g. "power-solo-monthly". */
  compPlan?: string | null;
  /** The desktop app's planLevelIntent. */
  intent?: unknown;
  /** Walkthrough profile and/or tags, for inference only. */
  profile?: OnboardingProfile | null;
  tags?: readonly string[] | null;
};

/**
 * Pure: the best plan level the inputs support, or null when nothing says.
 * The Daily Deals add-on variant is ignored (it is not a plan level).
 */
export function resolvePlanLevel(input: PlanLevelInput): ResolvedPlanLevel | null {
  if (input.lsVariantId != null && String(input.lsVariantId) !== "" && !isAddonVariant(input.lsVariantId)) {
    return { level: planLevelForVariantId(input.lsVariantId), source: "ls" };
  }
  if (typeof input.compPlan === "string" && input.compPlan.trim() !== "") {
    return { level: levelForPlan(input.compPlan), source: "comp" };
  }
  const intent = normalizePlanLevelIntent(input.intent);
  if (intent) return { level: intent, source: "intent" };

  const tags = input.tags ?? [];
  const p = input.profile;
  if (
    p?.experience === "brand-new" ||
    p?.goal === "beginner-start" ||
    tags.includes("wt-exp-brand-new") ||
    tags.includes("wt-goal-beginner-start")
  ) {
    return { level: "beginner", source: "inferred" };
  }
  return null;
}

export type SyncPlanLevelResult = {
  ok: boolean;
  changed: boolean;
  reason?: "invalid" | "no-contact" | "lower-rank" | "unchanged" | "error";
};

let warnedMissingColumns = false;

/**
 * Writes plan level to email_subscribers: replaces the plan- tag and sets
 * plan_level / plan_level_source, unless a higher-ranked source is already
 * stored (pass `force` to override the rank guard). Never creates a contact
 * (that would add a paying customer to the newsletter base) and never fires
 * enrollForTagAdded. Never throws.
 */
export async function syncPlanLevelTag(
  db: SupabaseClient,
  rawEmail: string,
  level: PlanLevelValue,
  source: PlanLevelSource,
  opts: { force?: boolean } = {},
): Promise<SyncPlanLevelResult> {
  const email = normalizeFunnelEmail(rawEmail);
  if (!email || !isPlanLevelValue(level) || planSourceRank(source) >= PLAN_LEVEL_SOURCE_RANK.length) {
    return { ok: false, changed: false, reason: "invalid" };
  }

  try {
    let columnsMissing = false;
    let read = await db
      .from("email_subscribers")
      .select("email,tags,plan_level,plan_level_source")
      .eq("email", email)
      .maybeSingle();
    if (read.error && isMissingSchemaError(read.error)) {
      columnsMissing = true;
      read = await db.from("email_subscribers").select("email,tags").eq("email", email).maybeSingle();
    }
    if (read.error) {
      console.error("plan-level: lookup failed", read.error);
      return { ok: false, changed: false, reason: "error" };
    }
    const row = read.data as { tags?: unknown; plan_level?: unknown; plan_level_source?: unknown } | null;
    if (!row) return { ok: true, changed: false, reason: "no-contact" };

    const tags = Array.isArray(row.tags)
      ? row.tags.filter((t: unknown): t is string => typeof t === "string")
      : [];
    const hasPlanTag = tags.some((t) => t.startsWith(PLAN_TAG_PREFIX));

    if (!opts.force) {
      if (columnsMissing) {
        // No stored source to compare: a weak source may only fill an empty slot.
        if (hasPlanTag && (source === "intent" || source === "inferred")) {
          return { ok: true, changed: false, reason: "lower-rank" };
        }
      } else if (row.plan_level_source && !canReplacePlanSource(String(row.plan_level_source), source)) {
        return { ok: true, changed: false, reason: "lower-rank" };
      }
    }

    const nextTags = replaceManagedTags(tags, [PLAN_TAGS[level]], [PLAN_TAG_PREFIX]);
    const tagsChanged = nextTags.length !== tags.length || nextTags.some((t, i) => t !== tags[i]);
    const columnsChanged =
      !columnsMissing && (row.plan_level !== level || row.plan_level_source !== source);
    if (!tagsChanged && !columnsChanged) return { ok: true, changed: false, reason: "unchanged" };

    if (tagsChanged) {
      const { error } = await db.from("email_subscribers").update({ tags: nextTags }).eq("email", email);
      if (error) {
        console.error("plan-level: tag update failed", error);
        return { ok: false, changed: false, reason: "error" };
      }
    }
    if (columnsChanged) {
      const { error } = await db
        .from("email_subscribers")
        .update({ plan_level: level, plan_level_source: source })
        .eq("email", email);
      if (error) {
        if (isMissingSchemaError(error)) columnsMissing = true;
        else console.error("plan-level: column update failed", error);
      }
    }
    if (columnsMissing && !warnedMissingColumns) {
      warnedMissingColumns = true;
      console.warn("plan-level: plan_level columns missing (apply 20261109_funnels_v2_data.sql); tag only");
    }
    return { ok: true, changed: true };
  } catch (err) {
    console.error("plan-level: syncPlanLevelTag threw", err);
    return { ok: false, changed: false, reason: "error" };
  }
}

async function emailForUserId(db: SupabaseClient, userId: string | null | undefined): Promise<string> {
  if (!userId) return "";
  try {
    const { data } = await db.from("profiles").select("email").eq("id", userId).maybeSingle();
    return normalizeFunnelEmail((data as { email?: unknown } | null)?.email);
  } catch {
    return "";
  }
}

/**
 * Hook for the LS webhook (subscription_created / subscription_updated):
 * records the variant's plan level with source `ls`, and when an LS trial
 * starts, supersedes the person's app-trial assignment. The add-on variant is
 * ignored. Fire-and-forget safe: never throws.
 */
export async function syncPlanLevelFromLsSubscription(
  db: SupabaseClient,
  args: {
    email?: string | null;
    userId?: string | null;
    variantId?: string | number | null;
    /** True on subscription_created with status on_trial (a real LS trial start). */
    trialStarted?: boolean;
  },
): Promise<void> {
  try {
    if (args.variantId == null || isAddonVariant(args.variantId)) return;
    const email = normalizeFunnelEmail(args.email) || (await emailForUserId(db, args.userId));
    if (!email) return;
    await syncPlanLevelTag(db, email, planLevelForVariantId(args.variantId), "ls");
    if (args.trialStarted) await supersedeAppTrial(db, email);
  } catch (err) {
    console.error("plan-level: syncPlanLevelFromLsSubscription threw", err);
  }
}

/**
 * Hook for plan switches we initiate (/api/subscription/upgrade, the
 * scheduled-downgrade cron). Takes either the new variant id or the canonical
 * plan string. The LS subscription_updated webhook repeats this; doing it here
 * too means the tag is right even if that delivery is late. Never throws.
 */
export async function syncPlanLevelForPlanChange(
  db: SupabaseClient,
  args: { email?: string | null; userId?: string | null; variantId?: string | number | null; plan?: string | null },
): Promise<void> {
  try {
    let level: PlanLevelValue | null = null;
    if (args.variantId != null && String(args.variantId) !== "") {
      if (isAddonVariant(args.variantId)) return;
      level = planForVariantId(args.variantId) ? planLevelForVariantId(args.variantId) : null;
    }
    if (!level && typeof args.plan === "string" && args.plan) level = levelForPlan(args.plan);
    if (!level) return;
    const email = normalizeFunnelEmail(args.email) || (await emailForUserId(db, args.userId));
    if (!email) return;
    await syncPlanLevelTag(db, email, level, "ls");
  } catch (err) {
    console.error("plan-level: syncPlanLevelForPlanChange threw", err);
  }
}
