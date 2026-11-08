// Funnels v2: activation and engagement signals.
//
// "Activated" means the person actually used the product, not just installed
// it. Every signal is recorded once per (email, signal) in funnel_milestones.
// STRONG signals (a butler ran, the extension paired, an automation-mode
// walkthrough finished, a desktop action or earnings sync reached us) also set
// email_subscribers.activated_at + activation_signal, first signal wins. WEAK
// signals (extension install, license validate) only set engaged_at.
//
// Activation % per funnel = activated_at within ACTIVATION_WINDOW_DAYS of the
// funnel's entry date (funnel-metrics, Phase 3).
//
// Callers are hot paths (desktop actions, license validation), so:
//   - every call is fire-and-forget safe: it never throws;
//   - a per-instance memo skips repeat (email, signal) pairs;
//   - nothing here creates an email_subscribers row (that would put a paying
//     customer on the newsletter base); the milestone row is still written,
//     so metrics can read funnel_milestones for people with no contact row.
//
// Tables/columns come from 20261109_funnels_v2_data.sql (hand-applied). A
// missing table or column is a silent no-op.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACTIVATION_SIGNAL_STRENGTH,
  ACTIVATION_SIGNALS,
  type ActivationSignal,
} from "@/lib/funnel-types";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError, normalizeFunnelEmail } from "@/lib/funnel-assignments";

export { ACTIVATION_SIGNALS };

export function isActivationSignal(v: unknown): v is ActivationSignal {
  return typeof v === "string" && (ACTIVATION_SIGNALS as readonly string[]).includes(v);
}

export function isStrongSignal(signal: ActivationSignal): boolean {
  return ACTIVATION_SIGNAL_STRENGTH[signal] === "strong";
}

/** Signals the desktop may report through the intake route's milestone stage. */
export const DESKTOP_MILESTONES: readonly ActivationSignal[] = ["first-butler-run", "extension-paired"];

export function isDesktopMilestone(v: unknown): v is ActivationSignal {
  return typeof v === "string" && (DESKTOP_MILESTONES as readonly string[]).includes(v);
}

// Per-instance memo of (email, signal) pairs already handled, so a chatty
// caller costs at most one round of writes per warm instance.
const MEMO_CAP = 5000;
const memo = new Set<string>();

function remember(key: string): void {
  if (memo.size >= MEMO_CAP) memo.clear();
  memo.add(key);
}

/** Tests only. */
export function __resetActivationMemo(): void {
  memo.clear();
}

export type MarkActivatedResult = {
  ok: boolean;
  /** funnel_milestones row written (false when it already existed or the table is missing). */
  recorded: boolean;
  /** activated_at was set by this call. */
  activated: boolean;
  /** engaged_at was set by this call. */
  engaged: boolean;
  reason?: "invalid" | "memo" | "error";
};

/**
 * Records an activation / engagement signal for an email. Never throws.
 * `db` defaults to the service-role client.
 */
export async function markActivated(
  rawEmail: string | null | undefined,
  signal: ActivationSignal,
  opts: { db?: SupabaseClient; source?: string; at?: Date } = {},
): Promise<MarkActivatedResult> {
  const none: MarkActivatedResult = { ok: true, recorded: false, activated: false, engaged: false };
  const email = normalizeFunnelEmail(rawEmail);
  if (!email || !email.includes("@") || !isActivationSignal(signal)) {
    return { ...none, ok: false, reason: "invalid" };
  }
  const memoKey = `${email}|${signal}`;
  if (memo.has(memoKey)) return { ...none, reason: "memo" };

  try {
    const db = opts.db ?? createAdminClient();
    const atIso = (opts.at ?? new Date()).toISOString();
    const out: MarkActivatedResult = { ...none };
    let hardError = false;

    // 1. Milestone log, once per (email, signal).
    const ins = await db
      .from("funnel_milestones")
      .upsert(
        { email, milestone: signal, source: opts.source ?? null, occurred_at: atIso },
        { onConflict: "email,milestone", ignoreDuplicates: true },
      )
      .select("email");
    if (ins.error) {
      if (!isMissingSchemaError(ins.error)) {
        hardError = true;
        console.error("funnel-activation: milestone insert failed", ins.error);
      }
    } else {
      out.recorded = Array.isArray(ins.data) && ins.data.length > 0;
    }

    // 2. First strong signal sets activated_at.
    if (isStrongSignal(signal)) {
      const upd = await db
        .from("email_subscribers")
        .update({ activated_at: atIso, activation_signal: signal })
        .eq("email", email)
        .is("activated_at", null)
        .select("email");
      if (upd.error) {
        if (!isMissingSchemaError(upd.error)) {
          hardError = true;
          console.error("funnel-activation: activated_at update failed", upd.error);
        }
      } else {
        out.activated = Array.isArray(upd.data) && upd.data.length > 0;
      }
    }

    // 3. Any signal sets engaged_at once (a strong signal implies engagement).
    const eng = await db
      .from("email_subscribers")
      .update({ engaged_at: atIso })
      .eq("email", email)
      .is("engaged_at", null)
      .select("email");
    if (eng.error) {
      if (!isMissingSchemaError(eng.error)) {
        hardError = true;
        console.error("funnel-activation: engaged_at update failed", eng.error);
      }
    } else {
      out.engaged = Array.isArray(eng.data) && eng.data.length > 0;
    }

    // Only memoize a clean pass, so a transient error retries next call.
    if (!hardError) remember(memoKey);
    return hardError ? { ...out, ok: false, reason: "error" } : out;
  } catch (err) {
    console.error("funnel-activation: markActivated threw", err);
    return { ...none, ok: false, reason: "error" };
  }
}

/**
 * markActivated for a signed-in or license-resolved user: uses `email` when
 * the caller already has it, else looks up profiles.email by user id. Never
 * throws.
 */
export async function markActivatedForUser(
  args: { userId?: string | null; email?: string | null },
  signal: ActivationSignal,
  opts: { db?: SupabaseClient; source?: string; at?: Date } = {},
): Promise<MarkActivatedResult> {
  const userKey = args.userId ? `u:${args.userId}|${signal}` : "";
  if (userKey && memo.has(userKey)) {
    return { ok: true, recorded: false, activated: false, engaged: false, reason: "memo" };
  }
  try {
    let email = normalizeFunnelEmail(args.email);
    let db = opts.db;
    if (!email && args.userId) {
      db = db ?? createAdminClient();
      const { data } = await db.from("profiles").select("email").eq("id", args.userId).maybeSingle();
      email = normalizeFunnelEmail((data as { email?: unknown } | null)?.email);
    }
    const res = await markActivated(email, signal, { ...opts, db });
    if (userKey && (res.ok || res.reason === "invalid")) remember(userKey);
    return res;
  } catch (err) {
    console.error("funnel-activation: markActivatedForUser threw", err);
    return { ok: false, recorded: false, activated: false, engaged: false, reason: "error" };
  }
}
