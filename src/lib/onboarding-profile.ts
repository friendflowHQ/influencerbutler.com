// Funnels v2: desktop walkthrough answers (the "onboarding profile").
//
// The desktop walkthrough asks experience, creator mode / starting path, goal,
// platforms, run mode, marketplaces and deals posting mode. The licensing
// Worker forwards a sanitized copy to /api/app-trial/signup, and this file:
//   - parses it against the strict ONBOARDING_VOCAB whitelist (unknown values
//     are dropped, never stored);
//   - turns it into managed `wt-*` tags on email_subscribers;
//   - stores the profile columns from 20261109_funnels_v2_data.sql.
//
// Managed tags are replaced, not unioned, so a re-answer wins. Writing them
// deliberately does NOT call enrollForTagAdded: the desktop backfill would
// otherwise tag every existing user at once and fire tag-triggered sequences
// in a single blast.
//
// Missing columns (prod lags migrations) degrade: tags still land, the profile
// columns are skipped and logged once per instance.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ONBOARDING_PROFILE_STAGES,
  ONBOARDING_PROFILE_VERSION,
  ONBOARDING_VOCAB,
  WT_MKT_INTL_TAG,
  WT_TAG_PREFIX,
  type OnboardingProfile,
  type OnboardingProfileStage,
} from "@/lib/funnel-types";
import { isMissingSchemaError, normalizeFunnelEmail } from "@/lib/funnel-assignments";

/** Prefix that every walkthrough tag shares (plan- tags are owned by plan-level.ts). */
export const WT_PREFIX = "wt-";

type ScalarField = "experience" | "aipPath" | "creatorMode" | "goal" | "mode" | "dealsPostingMode" | "outcome";
type ArrayField = "platforms" | "marketplaces";
type ProfileField = ScalarField | ArrayField;

const SCALAR_FIELDS: readonly ScalarField[] = [
  "experience",
  "aipPath",
  "creatorMode",
  "goal",
  "mode",
  "dealsPostingMode",
  "outcome",
];
const ARRAY_FIELDS: readonly ArrayField[] = ["platforms", "marketplaces"];
const PROFILE_FIELDS: readonly ProfileField[] = [...SCALAR_FIELDS, ...ARRAY_FIELDS];

/** Serialized profile cap (matches the Worker's sanitizeProfile). */
export const MAX_PROFILE_JSON_BYTES = 2048;

function isStage(v: unknown): v is OnboardingProfileStage {
  return typeof v === "string" && (ONBOARDING_PROFILE_STAGES as readonly string[]).includes(v);
}

function pickScalar(field: ScalarField, raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase();
  return (ONBOARDING_VOCAB[field] as readonly string[]).includes(v) ? v : undefined;
}

function pickArray(field: ArrayField, raw: unknown): string[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const allowed = ONBOARDING_VOCAB[field] as readonly string[];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const v = item.trim().toLowerCase();
    if (allowed.includes(v) && !out.includes(v)) out.push(v);
    if (out.length >= allowed.length) break;
  }
  return out.length > 0 ? out : undefined;
}

/**
 * Strict parse of a walkthrough profile. Returns null when nothing valid is
 * present (a bare `{stage}` is not a profile). `stageHint` (the request's
 * stage) is used when the profile itself does not carry a valid stage; the
 * default is "capture". Unknown keys and values are dropped.
 */
export function parseOnboardingProfile(
  raw: unknown,
  stageHint?: unknown,
): OnboardingProfile | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const src = raw as Record<string, unknown>;

  const out: OnboardingProfile = {
    v: ONBOARDING_PROFILE_VERSION,
    stage: isStage(src.stage) ? src.stage : isStage(stageHint) ? stageHint : "capture",
  };
  let fields = 0;
  for (const f of SCALAR_FIELDS) {
    const v = pickScalar(f, src[f]);
    if (v !== undefined) {
      (out as unknown as Record<string, unknown>)[f] = v;
      fields++;
    }
  }
  for (const f of ARRAY_FIELDS) {
    const v = pickArray(f, src[f]);
    if (v !== undefined) {
      (out as unknown as Record<string, unknown>)[f] = v;
      fields++;
    }
  }
  if (fields === 0) return null;
  // Whitelisted values keep this far under the cap; the guard is belt and braces.
  if (JSON.stringify(out).length > MAX_PROFILE_JSON_BYTES) return null;
  return out;
}

/** Tag prefixes a profile field owns. marketplaces owns only wt-mkt-intl. */
function fieldPrefix(field: ProfileField): string {
  return field === "marketplaces" ? WT_MKT_INTL_TAG : WT_TAG_PREFIX[field];
}

/** Managed `wt-*` tags for a profile, in a stable order. */
export function profileTags(p: OnboardingProfile | null | undefined): string[] {
  if (!p) return [];
  const out: string[] = [];
  const push = (t: string) => {
    if (!out.includes(t)) out.push(t);
  };
  for (const f of SCALAR_FIELDS) {
    const v = p[f];
    if (typeof v === "string") push(`${WT_TAG_PREFIX[f]}${v}`);
  }
  for (const v of p.platforms ?? []) push(`${WT_TAG_PREFIX.platforms}${v}`);
  if ((p.marketplaces ?? []).some((m) => m !== "us")) push(WT_MKT_INTL_TAG);
  return out;
}

/**
 * Best-effort inverse of profileTags, for reads where the onboarding_profile
 * column is missing in prod. Marketplaces cannot be recovered from tags (only
 * the wt-mkt-intl flag exists), so the result never has `marketplaces`;
 * callers read that tag directly.
 */
export function profileFromTags(tags: readonly string[] | null | undefined): OnboardingProfile | null {
  if (!tags || tags.length === 0) return null;
  const src: Record<string, unknown> = {};
  for (const f of SCALAR_FIELDS) {
    const prefix = WT_TAG_PREFIX[f];
    for (const t of tags) {
      if (!t.startsWith(prefix)) continue;
      const v = t.slice(prefix.length);
      if ((ONBOARDING_VOCAB[f] as readonly string[]).includes(v)) src[f] = v;
    }
  }
  const platforms = tags
    .filter((t) => t.startsWith(WT_TAG_PREFIX.platforms))
    .map((t) => t.slice(WT_TAG_PREFIX.platforms.length));
  if (platforms.length > 0) src.platforms = platforms;
  const stage = src.outcome ? "complete" : "capture";
  return parseOnboardingProfile(src, stage);
}

/**
 * Removes tags matching any of `prefixes` from `existing`, then appends
 * `next`. Non-managed tags keep their order. Pure.
 */
export function replaceManagedTags(
  existing: readonly string[],
  next: readonly string[],
  prefixes: readonly string[],
): string[] {
  const kept = existing.filter((t) => !prefixes.some((p) => t.startsWith(p)));
  const out = [...kept];
  for (const t of next) if (!out.includes(t)) out.push(t);
  return out;
}

/** Fields present on a profile. */
function presentFields(p: OnboardingProfile): ProfileField[] {
  return PROFILE_FIELDS.filter((f) => {
    const v = p[f];
    return Array.isArray(v) ? v.length > 0 : typeof v === "string";
  });
}

/**
 * What a new profile does to the stored one.
 * - complete / backfill: replaces everything (all `wt-*` tags, whole profile).
 * - capture over an existing profile: replaces only the fields it carries, so
 *   a late or repeated capture forward cannot wipe the run mode, outcome or
 *   deals mode that only a completion knows.
 * Pure; exported for tests.
 */
export function mergeOnboardingProfile(
  stored: OnboardingProfile | null,
  incoming: OnboardingProfile,
): { profile: OnboardingProfile; replacePrefixes: string[] } {
  if (incoming.stage !== "capture" || !stored) {
    return { profile: incoming, replacePrefixes: [WT_PREFIX] };
  }
  const fields = presentFields(incoming);
  const merged: OnboardingProfile = { ...stored, v: incoming.v };
  for (const f of fields) (merged as unknown as Record<string, unknown>)[f] = incoming[f];
  // A capture after completion leaves the stored (later) stage in place.
  merged.stage = stored.stage;
  return { profile: merged, replacePrefixes: fields.map(fieldPrefix) };
}

let warnedMissingColumns = false;

export type ApplyProfileResult = {
  ok: boolean;
  tagsChanged: boolean;
  columnsWritten: boolean;
  tags?: string[];
  reason?: "invalid" | "no-contact" | "error";
};

/**
 * Writes a parsed profile to email_subscribers: managed `wt-*` tags first,
 * then (a separate update) onboarding_profile / _stage / _at. Never creates a
 * contact (the intake enrolls first) and never fires enrollForTagAdded. Never
 * throws.
 */
export async function applyOnboardingProfile(
  db: SupabaseClient,
  rawEmail: string,
  profile: OnboardingProfile,
  opts: { now?: Date } = {},
): Promise<ApplyProfileResult> {
  const email = normalizeFunnelEmail(rawEmail);
  if (!email || !profile) return { ok: false, tagsChanged: false, columnsWritten: false, reason: "invalid" };
  const nowIso = (opts.now ?? new Date()).toISOString();

  try {
    let columnsMissing = false;
    let read = await db
      .from("email_subscribers")
      .select("email,tags,onboarding_profile")
      .eq("email", email)
      .maybeSingle();
    if (read.error && isMissingSchemaError(read.error)) {
      columnsMissing = true;
      read = await db.from("email_subscribers").select("email,tags").eq("email", email).maybeSingle();
    }
    if (read.error) {
      console.error("onboarding-profile: lookup failed", read.error);
      return { ok: false, tagsChanged: false, columnsWritten: false, reason: "error" };
    }
    const row = read.data as { tags?: unknown; onboarding_profile?: unknown } | null;
    if (!row) return { ok: true, tagsChanged: false, columnsWritten: false, reason: "no-contact" };

    const existingTags = Array.isArray(row.tags)
      ? row.tags.filter((t: unknown): t is string => typeof t === "string")
      : [];
    const stored = columnsMissing
      ? profileFromTags(existingTags)
      : parseOnboardingProfile(row.onboarding_profile);

    const { profile: next, replacePrefixes } = mergeOnboardingProfile(stored, profile);
    const nextTags = replaceManagedTags(existingTags, profileTags(next), replacePrefixes);
    const tagsChanged =
      nextTags.length !== existingTags.length || nextTags.some((t, i) => t !== existingTags[i]);

    if (tagsChanged) {
      const { error } = await db.from("email_subscribers").update({ tags: nextTags }).eq("email", email);
      if (error) {
        console.error("onboarding-profile: tag update failed", error);
        return { ok: false, tagsChanged: false, columnsWritten: false, reason: "error" };
      }
    }

    let columnsWritten = false;
    if (!columnsMissing) {
      const { error } = await db
        .from("email_subscribers")
        .update({
          onboarding_profile: next,
          onboarding_profile_stage: next.stage,
          onboarding_profile_at: nowIso,
        })
        .eq("email", email);
      if (error) {
        if (isMissingSchemaError(error)) columnsMissing = true;
        else console.error("onboarding-profile: column update failed", error);
      } else {
        columnsWritten = true;
      }
    }
    if (columnsMissing && !warnedMissingColumns) {
      warnedMissingColumns = true;
      console.warn("onboarding-profile: profile columns missing (apply 20261109_funnels_v2_data.sql); tags only");
    }

    return { ok: true, tagsChanged, columnsWritten, tags: nextTags };
  } catch (err) {
    console.error("onboarding-profile: applyOnboardingProfile threw", err);
    return { ok: false, tagsChanged: false, columnsWritten: false, reason: "error" };
  }
}
