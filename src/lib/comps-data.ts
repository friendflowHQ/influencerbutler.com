/**
 * Shared loader for the comp (free-code) tracking feature. Both the admin Comps
 * page (GET /api/admin/comps) and the comp-expiry cron call loadComps() so the
 * dashboard view and the automation can never disagree about who is comped or
 * when their free window ends.
 *
 * A comp = a subscription started with a (near-)100%-off discount. We detect it
 * from the originating order: an order is a comp order when a discount was
 * applied (discount_total_cents > 0) AND the customer paid nothing (total 0),
 * OR the code itself carries a FREE window. That fully-discounted signal catches
 * comps whose code has no FREE token (e.g. BENABLE) while excluding ordinary
 * percentage discounts (affiliate 15% orders still have total > 0).
 *
 * Duration comes from the code via parseCompMonths(); a manual override stored
 * in comp_grants always wins. Codes we cannot parse are surfaced as
 * "unknown-months" so the owner sets the duration by hand - they are never
 * auto-cancelled on a guess.
 */
import { createAdminClient } from "@/lib/admin";
import { addMonthsUtc, compNameFromCode, parseCompMonths } from "@/lib/comp-codes";

const ROW_LIMIT = 5000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type CompState =
  | "unknown-months"
  | "expired"
  | "expiring-7"
  | "expiring-30"
  | "active"
  | "cancelled";

export type CompRow = {
  lsSubscriptionId: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  discountCode: string | null;
  months: number | null;
  monthsSource: "parsed" | "manual" | null;
  issuedAt: string | null;
  expiresAt: string | null;
  daysRemaining: number | null;
  subscriptionStatus: string | null;
  renewsAt: string | null;
  licenseStatus: string | null;
  state: CompState;
  cancelledAt: string | null;
  warn7SentAt: string | null;
  warn1SentAt: string | null;
};

export type CompsResult = {
  rows: CompRow[];
  /** True when the discount columns / comp_grants table are not yet in prod. */
  migrationPending: boolean;
};

type Row = Record<string, unknown>;
type QueryResult = Promise<{ data: Row[] | null; error: { message?: string; code?: string } | null }>;

// Wider view of the service-role client than createAdminClient exposes, matching
// the approach in the trial-funnel route. Only the chainable read ops we use.
type Builder = {
  eq: (col: string, value: string) => Builder;
  gt: (col: string, value: number) => Builder;
  in: (col: string, values: string[]) => Builder;
  order: (col: string, opts: { ascending: boolean }) => Builder;
  limit: (n: number) => QueryResult;
} & QueryResult;

type CompsClient = {
  from: (table: string) => { select: (cols: string) => Builder };
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * A discounted order is a comp order when the buyer paid nothing (fully comped)
 * or the code spells out a free window. Ordinary percentage discounts keep a
 * positive total and no FREE token, so they are excluded.
 */
function isCompOrder(total: number, code: string | null): boolean {
  if (code && (/FREE/i.test(code) || parseCompMonths(code) !== null)) return true;
  return total === 0;
}

export async function loadComps(now: number = Date.now()): Promise<CompsResult | null> {
  const svc = createAdminClient() as unknown as CompsClient | null;
  if (!svc) return null;

  let migrationPending = false;

  // 1) Discounted orders, oldest first (so the first per user is the earliest).
  //    Filtering to discount_total_cents > 0 keeps this scan small even on a
  //    large orders table. If that column is missing (20260704 not applied in
  //    prod), degrade to an empty comp list rather than erroring.
  const ordersRes = await svc
    .from("orders")
    .select("user_id,ls_subscription_id,total,discount_total_cents,discount_code,created_at")
    .gt("discount_total_cents", 0)
    .order("created_at", { ascending: true })
    .limit(ROW_LIMIT);

  if (ordersRes.error) {
    console.error("loadComps: orders query failed", ordersRes.error);
    return { rows: [], migrationPending: true };
  }

  // Earliest comp order per user.
  const compByUser = new Map<string, { code: string | null; issuedAt: string | null }>();
  for (const row of ordersRes.data ?? []) {
    const userId = str(row.user_id);
    if (!userId) continue;
    const code = str(row.discount_code);
    if (!isCompOrder(num(row.total), code)) continue;
    if (compByUser.has(userId)) continue; // ascending order => first is earliest
    compByUser.set(userId, { code, issuedAt: str(row.created_at) });
  }

  const userIds = [...compByUser.keys()];
  if (userIds.length === 0) return { rows: [], migrationPending };

  // 2) Live subscriptions for those users.
  const subsRes = await svc
    .from("subscriptions")
    .select("ls_subscription_id,user_id,status,plan_name,renews_at,created_at")
    .in("user_id", userIds)
    .limit(ROW_LIMIT);
  if (subsRes.error) {
    console.error("loadComps: subscriptions query failed", subsRes.error);
    return { rows: [], migrationPending: true };
  }

  // 3) Emails and license status, keyed by user.
  const [profilesRes, licensesRes] = await Promise.all([
    svc.from("profiles").select("id,email").in("id", userIds).limit(ROW_LIMIT),
    svc
      .from("license_keys")
      .select("user_id,status,created_at")
      .in("user_id", userIds)
      .limit(ROW_LIMIT),
  ]);
  const emailByUser = new Map<string, string | null>();
  for (const row of profilesRes.data ?? []) {
    const id = str(row.id);
    if (id) emailByUser.set(id, str(row.email));
  }
  const licenseByUser = new Map<string, { status: string | null; createdAt: string | null }>();
  for (const row of licensesRes.data ?? []) {
    const id = str(row.user_id);
    if (id && !licenseByUser.has(id)) {
      licenseByUser.set(id, { status: str(row.status), createdAt: str(row.created_at) });
    }
  }

  // 4) comp_grants overrides + automation markers (table may not exist yet).
  const grantBySub = new Map<string, Row>();
  const grantsRes = await svc.from("comp_grants").select("*").limit(ROW_LIMIT);
  if (grantsRes.error) {
    migrationPending = true;
  } else {
    for (const row of grantsRes.data ?? []) {
      const id = str(row.ls_subscription_id);
      if (id) grantBySub.set(id, row);
    }
  }

  // 5) One comp row per subscription whose user has a comp order.
  const rows: CompRow[] = [];
  for (const sub of subsRes.data ?? []) {
    const userId = str(sub.user_id);
    const lsSubId = str(sub.ls_subscription_id);
    if (!userId || !lsSubId) continue;
    const comp = compByUser.get(userId);
    if (!comp) continue;

    const status = str(sub.status);
    const grant = grantBySub.get(lsSubId);
    const license = licenseByUser.get(userId);

    const code = comp.code;
    const parsed = parseCompMonths(code);
    const manualMonths =
      grant && str(grant.months_source) === "manual" && typeof grant.months === "number"
        ? (grant.months as number)
        : null;
    const months = manualMonths ?? parsed;
    const monthsSource: "parsed" | "manual" | null =
      manualMonths != null ? "manual" : parsed != null ? "parsed" : null;

    const issuedAt = comp.issuedAt ?? license?.createdAt ?? str(sub.created_at);
    const expiresAt = months != null && issuedAt ? addMonthsUtc(issuedAt, months) : null;
    const daysRemaining =
      expiresAt != null ? Math.floor((new Date(expiresAt).getTime() - now) / DAY_MS) : null;

    const cancelledAt = str(grant?.cancelled_at);
    let state: CompState;
    if (status === "cancelled" || cancelledAt) state = "cancelled";
    else if (months == null || daysRemaining == null) state = "unknown-months";
    else if (daysRemaining <= 0) state = "expired";
    else if (daysRemaining <= 7) state = "expiring-7";
    else if (daysRemaining <= 30) state = "expiring-30";
    else state = "active";

    rows.push({
      lsSubscriptionId: lsSubId,
      userId,
      email: emailByUser.get(userId) ?? null,
      name: compNameFromCode(code),
      discountCode: code,
      months,
      monthsSource,
      issuedAt,
      expiresAt,
      daysRemaining,
      subscriptionStatus: status,
      renewsAt: str(sub.renews_at),
      licenseStatus: license?.status ?? null,
      state,
      cancelledAt,
      warn7SentAt: str(grant?.warn7_sent_at),
      warn1SentAt: str(grant?.warn1_sent_at),
    });
  }

  // Needs-attention first: unknown months, then soonest-expiring. Cancelled last.
  const rank: Record<CompState, number> = {
    "unknown-months": 0,
    expired: 1,
    "expiring-7": 2,
    "expiring-30": 3,
    active: 4,
    cancelled: 5,
  };
  rows.sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    const da = a.daysRemaining ?? Number.POSITIVE_INFINITY;
    const db = b.daysRemaining ?? Number.POSITIVE_INFINITY;
    return da - db;
  });

  return { rows, migrationPending };
}
