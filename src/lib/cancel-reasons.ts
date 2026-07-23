// Single source of truth for the cancellation questionnaire.
//
// The same reason labels and buying-intent options are rendered in three
// places: the in-app CancelFunnel, the emailed survey page (for cancellations
// that skipped the funnel), and the admin cancellations view. Keeping them here
// means a new reason only has to be added once.

import { createAdminClient } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/mask-email";

export type Reason =
  | "too_expensive"
  | "not_using"
  | "missing_features"
  | "found_alternative"
  | "technical_issues"
  | "just_testing"
  | "other";

export type ReasonOption = { value: Reason; label: string };

export const REASONS: ReasonOption[] = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "found_alternative", label: "Found an alternative" },
  { value: "technical_issues", label: "Technical issues" },
  { value: "just_testing", label: "Just testing it out" },
  { value: "other", label: "Other" },
];

export function reasonLabel(value: string | null): string {
  if (!value) return "Unspecified";
  const found = REASONS.find((r) => r.value === value);
  return found ? found.label : value;
}

export type WouldReturn = "yes" | "maybe" | "no";

export type WouldReturnOption = { value: WouldReturn; label: string };

export const WOULD_RETURN_OPTIONS: WouldReturnOption[] = [
  { value: "yes", label: "Yes, likely" },
  { value: "maybe", label: "Maybe someday" },
  { value: "no", label: "No" },
];

const REASON_VALUES = new Set<string>(REASONS.map((r) => r.value));
const WOULD_RETURN_VALUES = new Set<string>(WOULD_RETURN_OPTIONS.map((o) => o.value));

/** Clamp an untrusted reason to a known value, defaulting to "other". */
export function normalizeReason(value: unknown): Reason {
  const v = typeof value === "string" ? value : "";
  return (REASON_VALUES.has(v) ? v : "other") as Reason;
}

/** Clamp an untrusted would-return answer, or null if not one of the options. */
export function normalizeWouldReturn(value: unknown): WouldReturn | null {
  const v = typeof value === "string" ? value : "";
  return WOULD_RETURN_VALUES.has(v) ? (v as WouldReturn) : null;
}

export type CancellationRow = {
  id: string;
  createdAt: string;
  reason: string;
  reasonLabel: string;
  feedback: string | null;
  intendedOutcome: string | null;
  wouldReturn: string | null;
  source: string;
  planName: string | null;
  emailMasked: string | null;
  completed: boolean;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Reads the most recent cancellation survey rows for the admin view. Service
 * role only (the table's RLS only exposes a user's own rows). Joins in the
 * customer email (masked) and the subscription plan name.
 */
export async function listCancellations(limit = 200): Promise<CancellationRow[]> {
  const supabase = createAdminClient();

  const { data: rows } = await supabase
    .from("subscription_cancel_reasons")
    .select(
      "id,user_id,subscription_id,reason,feedback,intended_outcome,would_return,source,emailed_at,completed_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const list = rows ?? [];
  if (list.length === 0) return [];

  const userIds = Array.from(new Set(list.map((r) => str(r.user_id)).filter(Boolean))) as string[];
  const subIds = Array.from(
    new Set(list.map((r) => str(r.subscription_id)).filter(Boolean)),
  ) as string[];

  const emailByUser = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id,email")
      .in("id", userIds);
    for (const p of profiles ?? []) {
      const id = str(p.id);
      if (id) emailByUser.set(id, str(p.email));
    }
  }

  const planBySub = new Map<string, string | null>();
  if (subIds.length > 0) {
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("ls_subscription_id,plan_name")
      .in("ls_subscription_id", subIds);
    for (const s of subs ?? []) {
      const id = str(s.ls_subscription_id);
      if (id) planBySub.set(id, str(s.plan_name));
    }
  }

  return list.map((r) => {
    const userId = str(r.user_id);
    const subId = str(r.subscription_id);
    const reason = str(r.reason) ?? "other";
    // A row created by the email flow but never answered has emailed_at set and
    // completed_at null. Treat those as incomplete so the admin can see reach vs
    // response.
    const isEmail = str(r.source) === "email";
    const completed = isEmail ? Boolean(str(r.completed_at)) : true;
    return {
      id: str(r.id) ?? "",
      createdAt: str(r.created_at) ?? "",
      reason,
      reasonLabel: reasonLabel(reason),
      feedback: str(r.feedback),
      intendedOutcome: str(r.intended_outcome),
      wouldReturn: str(r.would_return),
      source: str(r.source) ?? "in_app",
      planName: subId ? planBySub.get(subId) ?? null : null,
      emailMasked: userId ? maskEmail(emailByUser.get(userId) ?? null) : null,
      completed,
    };
  });
}

/**
 * Counts subscriptions that have ended (cancelled or expired) but have no
 * corresponding row in subscription_cancel_reasons. This is the coverage gap:
 * churn we captured no reason for. Directly answers "did the recent cancels
 * leave a reason?".
 */
export async function countUnsurveyedEndedSubs(): Promise<number> {
  const supabase = createAdminClient();

  const { data: ended } = await supabase
    .from("subscriptions")
    .select("ls_subscription_id,status")
    .in("status", ["cancelled", "expired"]);

  const endedIds = new Set(
    (ended ?? []).map((s) => str(s.ls_subscription_id)).filter(Boolean) as string[],
  );
  if (endedIds.size === 0) return 0;

  const { data: surveyed } = await supabase
    .from("subscription_cancel_reasons")
    .select("subscription_id");
  for (const row of surveyed ?? []) {
    const id = str(row.subscription_id);
    if (id) endedIds.delete(id);
  }

  return endedIds.size;
}
