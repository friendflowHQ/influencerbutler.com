// Funnels v2: exits on email_funnel_assignments.
//
// A person who leaves a funnel for a reason other than buying (an LS trial
// started while they were on the app trial, an unsubscribe, a plan change) is
// recorded here as exited_at + exit_reason. Exits are NEVER written as fake
// *_converted_at stamps, which would inflate paid conversion.
//
// The table comes from supabase/migrations/20261109_funnels_v2_data.sql, which
// is hand-applied and may lag prod. Every call degrades to a no-op on a missing
// table or column (42P01 / PGRST205 / 42703 / PGRST204).
//
// Track selection and the sticky assignment upsert live in funnel-personalize
// (Phase 2). This file only owns exits so the plumbing hooks can call it
// without pulling in copy or personalization code.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FunnelExitReason } from "@/lib/funnel-types";

type PgError = { code?: string; message?: string } | null | undefined;

/** True when the error means a table or column from a hand-applied migration
 * is not in prod yet. */
export function isMissingSchemaError(error: PgError): boolean {
  const code = error?.code;
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
}

export function normalizeFunnelEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

export type ExitResult = {
  ok: boolean;
  changed: boolean;
  reason?: "invalid" | "already-exited" | "no-assignment" | "migration-pending" | "error";
};

/**
 * Marks (email, funnel) as exited. Idempotent: an assignment that already has
 * exited_at keeps its first exit. With createIfMissing, a person who was in the
 * funnel but never got an assignment row (assignments are created lazily at
 * send time) gets an exited row with the default track, so the send path sees
 * the exit when it first looks.
 */
export async function exitAssignment(
  db: SupabaseClient,
  rawEmail: string,
  funnel: string,
  reason: FunnelExitReason,
  opts: { at?: Date; createIfMissing?: boolean } = {},
): Promise<ExitResult> {
  const email = normalizeFunnelEmail(rawEmail);
  if (!email || !funnel) return { ok: false, changed: false, reason: "invalid" };
  const atIso = (opts.at ?? new Date()).toISOString();

  try {
    const { data, error } = await db
      .from("email_funnel_assignments")
      .select("email,exited_at")
      .eq("email", email)
      .eq("funnel", funnel)
      .maybeSingle();
    if (error) {
      if (isMissingSchemaError(error)) return { ok: true, changed: false, reason: "migration-pending" };
      console.error("funnel-assignments: exit lookup failed", error);
      return { ok: false, changed: false, reason: "error" };
    }

    if (data) {
      if ((data as { exited_at?: string | null }).exited_at) {
        return { ok: true, changed: false, reason: "already-exited" };
      }
      const { error: updErr } = await db
        .from("email_funnel_assignments")
        .update({ exited_at: atIso, exit_reason: reason, updated_at: atIso })
        .eq("email", email)
        .eq("funnel", funnel)
        .is("exited_at", null);
      if (updErr) {
        if (isMissingSchemaError(updErr)) return { ok: true, changed: false, reason: "migration-pending" };
        console.error("funnel-assignments: exit update failed", updErr);
        return { ok: false, changed: false, reason: "error" };
      }
      return { ok: true, changed: true };
    }

    if (!opts.createIfMissing) return { ok: true, changed: false, reason: "no-assignment" };

    // ignoreDuplicates: a concurrent send-path insert wins and keeps its track;
    // the next exit call then updates it.
    const { error: insErr } = await db.from("email_funnel_assignments").upsert(
      { email, funnel, exited_at: atIso, exit_reason: reason, updated_at: atIso },
      { onConflict: "email,funnel", ignoreDuplicates: true },
    );
    if (insErr) {
      if (isMissingSchemaError(insErr)) return { ok: true, changed: false, reason: "migration-pending" };
      console.error("funnel-assignments: exit insert failed", insErr);
      return { ok: false, changed: false, reason: "error" };
    }
    return { ok: true, changed: true };
  } catch (err) {
    console.error("funnel-assignments: exitAssignment threw", err);
    return { ok: false, changed: false, reason: "error" };
  }
}

/**
 * An LS trial just started for this email. The LS trial drip supersedes the
 * app-trial drip, so close the app-trial assignment with exit_reason
 * 'superseded'. Only acts on someone who is actually on the app trial: an
 * existing assignment, or an email_subscribers row with app_trial_started_at
 * and no app_trial_converted_at. Never throws.
 */
export async function supersedeAppTrial(db: SupabaseClient, rawEmail: string): Promise<ExitResult> {
  const email = normalizeFunnelEmail(rawEmail);
  if (!email) return { ok: false, changed: false, reason: "invalid" };
  try {
    const first = await exitAssignment(db, email, "apptrial", "superseded");
    if (first.reason !== "no-assignment") return first;

    const { data, error } = await db
      .from("email_subscribers")
      .select("app_trial_started_at,app_trial_converted_at")
      .eq("email", email)
      .maybeSingle();
    if (error) {
      if (isMissingSchemaError(error)) return { ok: true, changed: false, reason: "migration-pending" };
      console.error("funnel-assignments: app-trial lookup failed", error);
      return { ok: false, changed: false, reason: "error" };
    }
    const row = data as { app_trial_started_at?: string | null; app_trial_converted_at?: string | null } | null;
    if (!row?.app_trial_started_at || row.app_trial_converted_at) {
      return { ok: true, changed: false, reason: "no-assignment" };
    }
    return await exitAssignment(db, email, "apptrial", "superseded", { createIfMissing: true });
  } catch (err) {
    console.error("funnel-assignments: supersedeAppTrial threw", err);
    return { ok: false, changed: false, reason: "error" };
  }
}
