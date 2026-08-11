// Single source of truth for the cancellation questionnaire.
//
// The same reason labels and buying-intent options are rendered in three
// places: the in-app CancelFunnel, the emailed survey page (for cancellations
// that skipped the funnel), and the admin cancellations view. Keeping them here
// means a new reason only has to be added once.

import { createAdminClient } from "@/lib/supabase/admin";
import { maskEmail } from "@/lib/mask-email";
import { loadComps, type CompRow, type CompState } from "@/lib/comps-data";

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

/**
 * Win-back drip progress for a cancellation, surfaced in the admin view.
 * `null` on a row when the winback_* columns aren't present yet (prod schema
 * lags the migrations folder) - the UI simply shows no win-back badge then.
 */
export type WinbackStatus = {
  /** How many of the 3 drip tiers have been sent. */
  tiersSent: number;
  /** Highest tier number sent (1-3), or null if none. */
  lastTier: number | null;
  /** The recipient claimed the free-comp offer. */
  claimed: boolean;
  /** The re-subscribe discount code minted for this row, if any. */
  discountCode: string | null;
};

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
  winback: WinbackStatus | null;
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

  // Win-back drip progress, fetched separately and best-effort: if the winback_*
  // columns aren't in the live schema yet (prod applies migrations by hand), this
  // query errors and we simply leave every row's winback as null.
  const rowIds = Array.from(new Set(list.map((r) => str(r.id)).filter(Boolean))) as string[];
  const winbackByRow = new Map<string, WinbackStatus>();
  if (rowIds.length > 0) {
    try {
      const { data: wb, error: wbErr } = await supabase
        .from("subscription_cancel_reasons")
        .select(
          "id,winback_t1_sent_at,winback_t2_sent_at,winback_t3_sent_at,winback_discount_code,winback_comp_claimed_at",
        )
        .in("id", rowIds);
      if (!wbErr) {
        for (const w of wb ?? []) {
          const id = str(w.id);
          if (!id) continue;
          const tiers = [w.winback_t1_sent_at, w.winback_t2_sent_at, w.winback_t3_sent_at].map((v) =>
            Boolean(str(v)),
          );
          let lastTier: number | null = null;
          tiers.forEach((sent, i) => {
            if (sent) lastTier = i + 1;
          });
          winbackByRow.set(id, {
            tiersSent: tiers.filter(Boolean).length,
            lastTier,
            claimed: Boolean(str(w.winback_comp_claimed_at)),
            discountCode: str(w.winback_discount_code),
          });
        }
      }
    } catch {
      // Columns not present yet: degrade to no win-back badges.
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
      winback: winbackByRow.get(str(r.id) ?? "") ?? null,
    };
  });
}

/** Statuses that mean the user currently has live access. Mirrors comp-issue.ts. */
const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** The win-back comp attached to a cancelled customer, with progress math. */
export type CompTracking = {
  /** The comp/discount code on the grant. */
  code: string | null;
  /** Free window length in months (null for day-granular / forever / unknown). */
  months: number | null;
  issuedAt: string | null;
  expiresAt: string | null;
  /** Whole days since the comp was issued (how far into the free window). */
  daysIn: number | null;
  /** Whole days until expiry; negative once past it. */
  daysLeft: number | null;
  /** Lifecycle bucket (active / expiring-7 / expiring-30 / expired / ...). */
  state: CompState;
  /** True once the recipient actually activated the key in the desktop app. */
  activated: boolean;
  activatedAt: string | null;
  lastSeenAt: string | null;
};

/** One cancelled customer, enriched with their win-back comp + outcome. */
export type CancelledCustomerRow = {
  lsSubscriptionId: string;
  emailMasked: string | null;
  planName: string | null;
  /** When the subscription ended (ends_at), falling back to created_at. */
  cancelledAt: string;
  reason: string | null;
  reasonLabel: string | null;
  wouldReturn: string | null;
  /** The auto win-back comp, or null if none has been issued yet. */
  comp: CompTracking | null;
  /** True when the user has a live PAID subscription again (not the comp). */
  reactivated: boolean;
  /** The win: we comped them AND they came back to a paying plan. */
  wonBackViaComp: boolean;
};

/** Aggregate cancellation + win-back metrics for the dashboard header. */
export type CancellationMetrics = {
  totalCancelled: number;
  distinctCustomers: number;
  compsGranted: number;
  compsPending: number;
  compsActivated: number;
  /** compsActivated / compsGranted (0..1). */
  compActivationRate: number;
  reactivations: number;
  /** reactivations / distinctCustomers (0..1). */
  reactivationRate: number;
  wonBackViaComp: number;
  /** wonBackViaComp / compsGranted (0..1) - the headline win-back conversion. */
  winBackConversionRate: number;
  /** Comps expiring soon, not yet reactivated = the reach-out list. */
  expiring7: number;
  expiring30: number;
  /** Comp lapsed without a return = lost. */
  expiredNoReturn: number;
  avgDaysIn: number | null;
  avgDaysLeft: number | null;
  funnel: { cancelled: number; compSent: number; compActivated: number; wonBack: number };
};

export type CancellationDashboard = {
  rows: CancelledCustomerRow[];
  metrics: CancellationMetrics;
};

function emptyMetrics(): CancellationMetrics {
  return {
    totalCancelled: 0,
    distinctCustomers: 0,
    compsGranted: 0,
    compsPending: 0,
    compsActivated: 0,
    compActivationRate: 0,
    reactivations: 0,
    reactivationRate: 0,
    wonBackViaComp: 0,
    winBackConversionRate: 0,
    expiring7: 0,
    expiring30: 0,
    expiredNoReturn: 0,
    avgDaysIn: null,
    avgDaysLeft: null,
    funnel: { cancelled: 0, compSent: 0, compActivated: 0, wonBack: 0 },
  };
}

/**
 * The cancellation + win-back tracking dashboard. Reads every real cancelled
 * subscription (excluding our own `comp:` sentinel rows), joins each customer to
 * their win-back comp (reusing loadComps() so the day/expiry/state/activation
 * math stays identical to the admin Comps page) and their newest cancel reason,
 * detects genuine reactivations (a live PAID sub, not the free comp), and rolls
 * the lot up into per-customer metrics. Service role only.
 */
export async function loadCancellationDashboard(limit = 300): Promise<CancellationDashboard> {
  const supabase = createAdminClient();
  const now = Date.now();

  const { data: rows } = await supabase
    .from("subscriptions")
    .select("ls_subscription_id,user_id,plan_name,created_at,ends_at")
    .eq("status", "cancelled")
    .not("ls_subscription_id", "like", "comp:%")
    .order("ends_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  const list = rows ?? [];
  if (list.length === 0) return { rows: [], metrics: emptyMetrics() };

  const userIds = Array.from(new Set(list.map((r) => str(r.user_id)).filter(Boolean))) as string[];

  // Comp details reused from loadComps() (indexed by user, newest comp wins).
  const compByUser = new Map<string, CompRow>();
  const compsResult = await loadComps(now);
  for (const c of compsResult?.rows ?? []) {
    const uid = c.userId;
    if (!uid) continue;
    const existing = compByUser.get(uid);
    if (!existing) {
      compByUser.set(uid, c);
      continue;
    }
    const a = c.issuedAt ? new Date(c.issuedAt).getTime() : 0;
    const b = existing.issuedAt ? new Date(existing.issuedAt).getTime() : 0;
    if (a > b) compByUser.set(uid, c);
  }

  const emailByUser = new Map<string, string | null>();
  const reasonByUser = new Map<string, { reason: string | null; wouldReturn: string | null }>();
  const reactivatedUsers = new Set<string>();

  if (userIds.length > 0) {
    const [profilesRes, reasonsRes, liveRes] = await Promise.all([
      supabase.from("profiles").select("id,email").in("id", userIds),
      supabase
        .from("subscription_cancel_reasons")
        .select("user_id,reason,would_return,created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false }),
      supabase
        .from("subscriptions")
        .select("user_id,status,ls_subscription_id")
        .in("user_id", userIds)
        .in("status", LIVE_STATUSES),
    ]);
    for (const p of profilesRes.data ?? []) {
      const id = str(p.id);
      if (id) emailByUser.set(id, str(p.email));
    }
    // Newest-first: keep the first reason we see per user.
    for (const rr of reasonsRes.data ?? []) {
      const id = str(rr.user_id);
      if (!id || reasonByUser.has(id)) continue;
      reasonByUser.set(id, { reason: str(rr.reason), wouldReturn: str(rr.would_return) });
    }
    // A live PAID subscription = a genuine reactivation (the comp's own live row
    // has a `comp:` sentinel and must not count as "came back").
    for (const s of liveRes.data ?? []) {
      const id = str(s.user_id);
      const lsId = str(s.ls_subscription_id) ?? "";
      if (id && !lsId.startsWith("comp:")) reactivatedUsers.add(id);
    }
  }

  const enriched = list.map((r) => {
    const userId = str(r.user_id);
    const comp = userId ? compByUser.get(userId) ?? null : null;
    const reactivated = userId ? reactivatedUsers.has(userId) : false;
    const reasonInfo = userId ? reasonByUser.get(userId) ?? null : null;
    const compTracking: CompTracking | null = comp
      ? {
          code: comp.discountCode,
          months: comp.months,
          issuedAt: comp.issuedAt,
          expiresAt: comp.expiresAt,
          daysIn: comp.issuedAt
            ? Math.max(0, Math.floor((now - new Date(comp.issuedAt).getTime()) / DAY_MS))
            : null,
          daysLeft: comp.daysRemaining,
          state: comp.state,
          activated: comp.activatedAt != null,
          activatedAt: comp.activatedAt,
          lastSeenAt: comp.lastSeenAt,
        }
      : null;
    const row: CancelledCustomerRow = {
      lsSubscriptionId: str(r.ls_subscription_id) ?? "",
      emailMasked: userId ? maskEmail(emailByUser.get(userId) ?? null) : null,
      planName: str(r.plan_name),
      cancelledAt: str(r.ends_at) ?? str(r.created_at) ?? "",
      reason: reasonInfo?.reason ?? null,
      reasonLabel: reasonInfo?.reason ? reasonLabel(reasonInfo.reason) : null,
      wouldReturn: reasonInfo?.wouldReturn ?? null,
      comp: compTracking,
      reactivated,
      wonBackViaComp: reactivated && compTracking != null,
    };
    return { userId, row };
  });

  // Sort: wins first, then reactivated, then at-risk (expiring soon), then
  // pending (no comp yet), then everything else.
  const rank = (row: CancelledCustomerRow): number => {
    if (row.wonBackViaComp) return 0;
    if (row.reactivated) return 1;
    if (row.comp && (row.comp.state === "expiring-7" || row.comp.state === "expiring-30")) return 2;
    if (!row.comp) return 3;
    return 4;
  };
  enriched.sort((a, b) => rank(a.row) - rank(b.row));

  return {
    rows: enriched.map((e) => e.row),
    metrics: computeCancellationMetrics(enriched),
  };
}

/**
 * Rolls the enriched rows up into dashboard metrics. Customer-level stats (comps,
 * activation, reactivation) are counted per distinct user so a customer with two
 * cancelled subscriptions is not double-counted; totalCancelled stays a raw row
 * count so it reconciles with the Overview "Cancelled" tile.
 */
function computeCancellationMetrics(
  enriched: { userId: string | null; row: CancelledCustomerRow }[],
): CancellationMetrics {
  const totalCancelled = enriched.length;

  // Collapse to one entry per user (first seen = highest-ranked after sort).
  const byUser = new Map<string, CancelledCustomerRow>();
  let anonSeq = 0;
  for (const e of enriched) {
    const key = e.userId ?? `anon:${anonSeq++}`;
    if (!byUser.has(key)) byUser.set(key, e.row);
  }
  const users = [...byUser.values()];

  const distinctCustomers = users.length;
  const withComp = users.filter((u) => u.comp);
  const compsGranted = withComp.length;
  const compsActivated = withComp.filter((u) => u.comp?.activated).length;
  const reactivations = users.filter((u) => u.reactivated).length;
  const wonBackViaComp = users.filter((u) => u.wonBackViaComp).length;
  const compsPending = users.filter((u) => !u.comp && !u.reactivated).length;
  const expiring7 = users.filter((u) => u.comp?.state === "expiring-7" && !u.reactivated).length;
  const expiring30 = users.filter((u) => u.comp?.state === "expiring-30" && !u.reactivated).length;
  const expiredNoReturn = users.filter((u) => u.comp?.state === "expired" && !u.reactivated).length;

  const daysInVals = withComp
    .map((u) => u.comp?.daysIn)
    .filter((v): v is number => typeof v === "number");
  const daysLeftVals = withComp
    .map((u) => u.comp?.daysLeft)
    .filter((v): v is number => typeof v === "number");
  const avg = (vals: number[]): number | null =>
    vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null;
  const rate = (n: number, d: number): number => (d > 0 ? n / d : 0);

  return {
    totalCancelled,
    distinctCustomers,
    compsGranted,
    compsPending,
    compsActivated,
    compActivationRate: rate(compsActivated, compsGranted),
    reactivations,
    reactivationRate: rate(reactivations, distinctCustomers),
    wonBackViaComp,
    winBackConversionRate: rate(wonBackViaComp, compsGranted),
    expiring7,
    expiring30,
    expiredNoReturn,
    avgDaysIn: avg(daysInVals),
    avgDaysLeft: avg(daysLeftVals),
    funnel: {
      cancelled: distinctCustomers,
      compSent: compsGranted,
      compActivated: compsActivated,
      wonBack: wonBackViaComp,
    },
  };
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
