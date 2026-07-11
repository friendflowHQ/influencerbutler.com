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
  /** 'in_house' comps are minted + cancelled entirely in Supabase; 'lemonsqueezy' via LS. */
  source: "in_house" | "lemonsqueezy";
  /** The recipient's license key (from license_keys.key), for the admin to copy. */
  licenseKey: string | null;
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

type OrderComp = { code: string | null; issuedAt: string | null };
type LicenseInfo = { status: string | null; createdAt: string | null; key: string | null };

export async function loadComps(now: number = Date.now()): Promise<CompsResult | null> {
  const svc = createAdminClient() as unknown as CompsClient | null;
  if (!svc) return null;

  let migrationPending = false;

  // 1) comp_grants is the canonical store: it holds in-house comps (no order),
  //    backfilled LS comps, and automation markers. If the table is missing,
  //    degrade to order-detection only.
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

  // 2) Order-detected LS comps (earliest discounted order per user). Missing
  //    discount columns (20260704 not in prod) degrades to no order comps rather
  //    than hiding in-house comps, which live in comp_grants + subscriptions.
  const compByUser = new Map<string, OrderComp>();
  const ordersRes = await svc
    .from("orders")
    .select("user_id,ls_subscription_id,total,discount_total_cents,discount_code,created_at")
    .gt("discount_total_cents", 0)
    .order("created_at", { ascending: true })
    .limit(ROW_LIMIT);
  if (ordersRes.error) {
    migrationPending = true;
  } else {
    for (const row of ordersRes.data ?? []) {
      const userId = str(row.user_id);
      if (!userId) continue;
      const code = str(row.discount_code);
      if (!isCompOrder(num(row.total), code)) continue;
      if (compByUser.has(userId)) continue; // ascending => first is earliest
      compByUser.set(userId, { code, issuedAt: str(row.created_at) });
    }
  }

  // 3) The subscriptions to consider: those of order-comp users and grant users,
  //    plus grant subscription ids directly (in-house/backfilled comps).
  const grantSubIds: string[] = [];
  const userIdSet = new Set<string>([...compByUser.keys()]);
  for (const [subId, grant] of grantBySub) {
    grantSubIds.push(subId);
    const uid = str(grant.user_id);
    if (uid) userIdSet.add(uid);
  }
  if (userIdSet.size === 0 && grantSubIds.length === 0) return { rows: [], migrationPending };

  const subById = new Map<string, Row>();
  if (userIdSet.size > 0) {
    const r = await svc
      .from("subscriptions")
      .select("ls_subscription_id,user_id,status,plan_name,renews_at,created_at")
      .in("user_id", [...userIdSet])
      .limit(ROW_LIMIT);
    if (r.error) migrationPending = true;
    else
      for (const s of r.data ?? []) {
        const id = str(s.ls_subscription_id);
        if (id) subById.set(id, s);
      }
  }
  const missingSubIds = grantSubIds.filter((id) => !subById.has(id));
  if (missingSubIds.length > 0) {
    const r = await svc
      .from("subscriptions")
      .select("ls_subscription_id,user_id,status,plan_name,renews_at,created_at")
      .in("ls_subscription_id", missingSubIds)
      .limit(ROW_LIMIT);
    if (!r.error)
      for (const s of r.data ?? []) {
        const id = str(s.ls_subscription_id);
        if (id) subById.set(id, s);
      }
  }

  // 4) Emails + license status for every user we might render.
  const finalUserIds = new Set<string>(userIdSet);
  for (const s of subById.values()) {
    const uid = str(s.user_id);
    if (uid) finalUserIds.add(uid);
  }
  const uidArr = [...finalUserIds];
  const emailByUser = new Map<string, string | null>();
  const licenseByUser = new Map<string, LicenseInfo>();
  // license_keys.id -> {key,status}, so a comp can show its OWN minted key
  // (via comp_grants.license_key_id) rather than the user's first key.
  const licenseById = new Map<string, { key: string | null; status: string | null }>();
  if (uidArr.length > 0) {
    const [profilesRes, licensesRes] = await Promise.all([
      svc.from("profiles").select("id,email").in("id", uidArr).limit(ROW_LIMIT),
      svc.from("license_keys").select("id,user_id,status,created_at,key").in("user_id", uidArr).limit(ROW_LIMIT),
    ]);
    for (const row of profilesRes.data ?? []) {
      const id = str(row.id);
      if (id) emailByUser.set(id, str(row.email));
    }
    for (const row of licensesRes.data ?? []) {
      const id = str(row.id);
      if (id) licenseById.set(id, { key: str(row.key), status: str(row.status) });
      const uid = str(row.user_id);
      if (uid && !licenseByUser.has(uid)) {
        licenseByUser.set(uid, { status: str(row.status), createdAt: str(row.created_at), key: str(row.key) });
      }
    }
  }

  // 5) One row per comp. A subscription is a comp when it has a grant OR its user
  //    is order-detected. Grants whose subscription was not found are still shown.
  const rows: CompRow[] = [];
  const emitted = new Set<string>();
  for (const [lsSubId, sub] of subById) {
    const userId = str(sub.user_id);
    const grant = grantBySub.get(lsSubId);
    const order = userId ? compByUser.get(userId) : undefined;
    if (!grant && !order) continue; // not a comp subscription
    rows.push(buildCompRow({ lsSubId, sub, grant, order, userId, emailByUser, licenseByUser, licenseById, now }));
    emitted.add(lsSubId);
  }
  for (const [lsSubId, grant] of grantBySub) {
    if (emitted.has(lsSubId)) continue;
    rows.push(
      buildCompRow({
        lsSubId,
        sub: null,
        grant,
        order: undefined,
        userId: str(grant.user_id),
        emailByUser,
        licenseByUser,
        licenseById,
        now,
      }),
    );
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

/**
 * Builds one CompRow from whichever sources are present: the live subscription,
 * the comp_grants row (canonical for in-house/backfilled comps and manual
 * overrides), and the earliest comp order (LS order-detected comps). A grant's
 * stored months/issued_at/expires_at take precedence over values derived from
 * the code, so in-house comps (which carry all three) render exactly.
 */
function buildCompRow(args: {
  lsSubId: string;
  sub: Row | null;
  grant: Row | undefined;
  order: OrderComp | undefined;
  userId: string | null;
  emailByUser: Map<string, string | null>;
  licenseByUser: Map<string, LicenseInfo>;
  licenseById: Map<string, { key: string | null; status: string | null }>;
  now: number;
}): CompRow {
  const { lsSubId, sub, grant, order, userId, emailByUser, licenseByUser, licenseById, now } = args;

  const status = sub ? str(sub.status) : null;
  const license = userId ? licenseByUser.get(userId) : undefined;
  // Prefer the comp's OWN minted key (comp_grants.license_key_id) so a user
  // with multiple keys shows the right one; fall back to their first key.
  const grantLicense = str(grant?.license_key_id)
    ? licenseById.get(str(grant?.license_key_id) as string)
    : undefined;

  const code = str(grant?.discount_code) ?? order?.code ?? null;
  const parsed = parseCompMonths(code);
  const grantMonths = grant && typeof grant.months === "number" ? (grant.months as number) : null;
  const isManual = grant != null && str(grant.months_source) === "manual" && grantMonths != null;
  const months = (isManual ? grantMonths : null) ?? parsed ?? grantMonths;
  const monthsSource: "parsed" | "manual" | null = isManual
    ? "manual"
    : parsed != null || grantMonths != null
      ? "parsed"
      : null;

  const issuedAt =
    str(grant?.issued_at) ?? order?.issuedAt ?? license?.createdAt ?? (sub ? str(sub.created_at) : null);
  const expiresAt =
    str(grant?.expires_at) ?? (months != null && issuedAt ? addMonthsUtc(issuedAt, months) : null);
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

  const source: "in_house" | "lemonsqueezy" =
    str(grant?.source) === "in_house" ? "in_house" : "lemonsqueezy";

  return {
    lsSubscriptionId: lsSubId,
    userId,
    email: (userId ? emailByUser.get(userId) : null) ?? str(grant?.user_email) ?? null,
    name: compNameFromCode(code),
    discountCode: code,
    months,
    monthsSource,
    issuedAt,
    expiresAt,
    daysRemaining,
    subscriptionStatus: status,
    renewsAt: sub ? str(sub.renews_at) : null,
    licenseStatus: grantLicense?.status ?? license?.status ?? null,
    licenseKey: grantLicense?.key ?? license?.key ?? null,
    state,
    cancelledAt,
    warn7SentAt: str(grant?.warn7_sent_at),
    warn1SentAt: str(grant?.warn1_sent_at),
    source,
  };
}
