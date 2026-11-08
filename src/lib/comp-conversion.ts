/**
 * Comp-to-paid conversion helpers.
 *
 * A comped user (free Pro via an in-house `comp:<uuid>` subscription, or a
 * Lemon Squeezy subscription started with a 100%-off code) must be able to
 * choose a paid plan before the comp ends. Their comp subscription still reads
 * as "live", so the checkout double-subscription guard has to ignore it, and
 * the new paid subscription should not bill until the comp's end date.
 */
import { IN_HOUSE_SUB_PREFIX } from "@/lib/comps-cancel";
import { lsApi } from "@/lib/lemonsqueezy";

/** Minimal Supabase surface we need (service-role client). */
type Svc = {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

export type OpenComp = {
  lsSubscriptionId: string;
  expiresAt: string | null;
  kind: string | null;
  discountCode: string | null;
  /** Set when the comp was cancelled (admin "Cancel now", or the expiry cron at its end). */
  cancelledAt: string | null;
  /** A Deals Butler Workspace add-on comp: it never covers Pro, so it never delays a Pro charge. */
  isAddon: boolean;
};

/**
 * Every comp grant row for a user (any state), keyed by its subscription id.
 * Best-effort: a query error returns an empty list so checkout never 500s on it.
 */
export async function compGrantsForUser(svc: Svc, userId: string): Promise<OpenComp[]> {
  try {
    const { data, error } = await svc
      .from("comp_grants")
      .select("ls_subscription_id,expires_at,cancelled_at,discount_code,kind")
      .eq("user_id", userId)
      .limit(50);
    if (error) {
      // `kind` may not exist yet in prod (manual migration): retry without it.
      const retry = await svc
        .from("comp_grants")
        .select("ls_subscription_id,expires_at,cancelled_at,discount_code")
        .eq("user_id", userId)
        .limit(50);
      if (retry.error) return [];
      return markAddons(svc, mapGrants(retry.data ?? []));
    }
    return markAddons(svc, mapGrants(data ?? []));
  } catch {
    return [];
  }
}

/** Flag Deals add-on comps from their (synthetic) subscription row's plan. */
async function markAddons(svc: Svc, grants: OpenComp[]): Promise<OpenComp[]> {
  if (grants.length === 0) return grants;
  try {
    const addonVariant = process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON || null;
    const { data } = await svc
      .from("subscriptions")
      .select("ls_subscription_id,plan_name,ls_variant_id")
      .in("ls_subscription_id", grants.map((g) => g.lsSubscriptionId));
    const addonIds = new Set<string>();
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const id = typeof r.ls_subscription_id === "string" ? r.ls_subscription_id : null;
      if (!id) continue;
      const variant = r.ls_variant_id != null ? String(r.ls_variant_id) : null;
      const plan = typeof r.plan_name === "string" ? r.plan_name : "";
      if ((addonVariant && variant === addonVariant) || /workspace/i.test(plan)) addonIds.add(id);
    }
    return grants.map((g) => ({ ...g, isAddon: addonIds.has(g.lsSubscriptionId) }));
  } catch {
    return grants;
  }
}

function mapGrants(rows: Record<string, unknown>[]): OpenComp[] {
  const out: OpenComp[] = [];
  for (const r of rows) {
    const id = typeof r.ls_subscription_id === "string" ? r.ls_subscription_id : null;
    if (!id) continue;
    out.push({
      lsSubscriptionId: id,
      expiresAt: typeof r.expires_at === "string" ? r.expires_at : null,
      kind: typeof r.kind === "string" ? r.kind : null,
      discountCode: typeof r.discount_code === "string" ? r.discount_code : null,
      cancelledAt: typeof r.cancelled_at === "string" ? r.cancelled_at : null,
      isAddon: false,
    });
  }
  return out;
}

/** True when a subscription id is a comp (in-house sentinel or a known comp grant). */
export function isCompSubscriptionId(id: string | null | undefined, grantIds: Set<string>): boolean {
  if (!id) return false;
  return id.startsWith(IN_HOUSE_SUB_PREFIX) || grantIds.has(id);
}

/**
 * The comp end date a new paid subscription's first charge should wait for:
 * the latest future expires_at among the user's comps, or null when no comp is
 * still running (then the plan's normal trial/billing applies).
 */
export function pendingCompEnd(grants: OpenComp[], now: number = Date.now()): string | null {
  let best: number | null = null;
  for (const g of grants) {
    if (!g.expiresAt) continue;
    const t = new Date(g.expiresAt).getTime();
    if (!Number.isFinite(t) || t <= now) continue;
    if (best == null || t > best) best = t;
  }
  return best == null ? null : new Date(best).toISOString();
}

/** A no-card trial comp, known from its label (set by the 20261108 migration / issuer). */
export function isTrialComp(g: Pick<OpenComp, "kind" | "discountCode">): boolean {
  return g.kind === "trial";
}

/**
 * Before the 20261108 migration there is no `kind`, and a no-card trial and a
 * 14-day admin/affiliate comp share the <NAME>FREE14D code shape. Such a row is
 * treated cautiously: its paid checkout gets the delay only as an EXTENSION of
 * the plan's own trial (never shortening it), and keeps the normal trial drip.
 */
export function isAmbiguousTrialComp(g: Pick<OpenComp, "kind" | "discountCode">): boolean {
  return !g.kind && /FREE14D$/i.test(g.discountCode ?? "");
}

/** Comps that can delay a Pro charge: not a known trial, not a Deals add-on comp. */
export function proCoveringComps(grants: OpenComp[]): OpenComp[] {
  return grants.filter((g) => !isTrialComp(g) && !g.isAddon);
}

/**
 * A comp whose free window is still running (not cancelled, ends more than an
 * hour from now). Any such comp, whatever its kind, gets the delayed first
 * charge: the checkout copy everywhere promises "first charge on your end date".
 */
export function isRunningComp(g: OpenComp, now: number = Date.now()): boolean {
  if (g.cancelledAt) return false;
  if (!g.expiresAt) return false;
  const t = new Date(g.expiresAt).getTime();
  return Number.isFinite(t) && t > now + 60 * 60 * 1000;
}

/** The running comp (latest end) for a user, if any. Trials included. */
export function runningComp(grants: OpenComp[], now: number = Date.now()): OpenComp | null {
  const running = grants.filter((g) => isRunningComp(g, now));
  running.sort((a, b) => new Date(b.expiresAt as string).getTime() - new Date(a.expiresAt as string).getTime());
  return running[0] ?? null;
}

type LsVariant = { data?: { attributes?: { has_free_trial?: boolean } } };

// has_free_trial rarely changes; cache it per variant for the life of the
// lambda so a transient LS error does not block a checkout that worked before.
const trialCache = new Map<string, boolean>();

/**
 * Whether a Lemon Squeezy variant has a free trial (the vehicle for the delayed
 * first charge). null when it could not be determined.
 */
export async function variantHasFreeTrial(variantId: string): Promise<boolean | null> {
  const cached = trialCache.get(variantId);
  if (cached !== undefined) return cached;
  try {
    const res = await lsApi(`/variants/${variantId}`, { method: "GET" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as LsVariant | null;
    const v = json?.data?.attributes?.has_free_trial;
    if (typeof v === "boolean") trialCache.set(variantId, v);
    return typeof v === "boolean" ? v : null;
  } catch {
    return null;
  }
}

/** PATCH an LS subscription's trial end. Returns true on success. */
export async function setSubscriptionTrialEnd(lsSubscriptionId: string, iso: string): Promise<boolean> {
  try {
    const res = await lsApi(`/subscriptions/${lsSubscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: { type: "subscriptions", id: String(lsSubscriptionId), attributes: { trial_ends_at: iso } },
      }),
    });
    if (res.ok) return true;
    const text = await res.text().catch(() => "");
    console.error("comp-conversion: trial_ends_at PATCH failed", {
      status: res.status,
      sub: lsSubscriptionId,
      text: text.slice(0, 300),
    });
    return false;
  } catch (error) {
    console.error("comp-conversion: trial_ends_at PATCH threw", error);
    return false;
  }
}
/** A comp that ended this long ago still counts as the source of a conversion. */
const CONVERSION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

export type ConversionSource = {
  grant: OpenComp;
  /** The comp is still running: the paid plan's first charge waits for its end. */
  keeper: boolean;
  /** Pre-migration FREE14D row: only ever EXTEND the plan's own trial, keep the trial drip. */
  extendOnly: boolean;
};

/**
 * The comp a brand-new paid subscription is converting from, if any.
 *
 * `keeper` is true when a Pro-covering comp (not a known trial, not a Deals
 * add-on comp) is still RUNNING, whatever its kind and even before the
 * 20261108 migration adds `kind`. Otherwise the most recent such comp that
 * ended (not revoked early) inside the conversion window is the source: the
 * conversion is recorded and the plan's normal LS trial applies. The new
 * subscription itself (an LS 100%-off comp checkout) never counts.
 */
export async function compConversionSource(
  svc: Svc,
  userId: string,
  newLsSubscriptionId: string,
  now: number = Date.now(),
): Promise<ConversionSource | null> {
  const grants = await compGrantsForUser(svc, userId);
  if (grants.some((g) => g.lsSubscriptionId === newLsSubscriptionId)) return null;
  const eligible = proCoveringComps(grants);
  const running = runningComp(eligible, now);
  if (running) return { grant: running, keeper: true, extendOnly: isAmbiguousTrialComp(running) };
  const ended = eligible
    .filter((g) => !isAmbiguousTrialComp(g))
    .filter((g) => !revokedEarly(g))
    .filter((g) => {
      if (!g.expiresAt) return true; // forever / unknown-length comps still count
      const t = new Date(g.expiresAt).getTime();
      return Number.isFinite(t) && t > now - CONVERSION_WINDOW_MS;
    })
    .sort((a, b) => {
      const ta = a.expiresAt ? new Date(a.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      const tb = b.expiresAt ? new Date(b.expiresAt).getTime() : Number.POSITIVE_INFINITY;
      return tb - ta;
    });
  const grant = ended[0];
  return grant ? { grant, keeper: false, extendOnly: false } : null;
}

/** Cancelled well before its end date (admin "Cancel now"), not by the expiry cron. */
function revokedEarly(g: OpenComp): boolean {
  if (!g.cancelledAt || !g.expiresAt) return false;
  const c = new Date(g.cancelledAt).getTime();
  const e = new Date(g.expiresAt).getTime();
  return Number.isFinite(c) && Number.isFinite(e) && c < e - 2 * 24 * 60 * 60 * 1000;
}

export type ConversionResult = {
  converted: boolean;
  firstChargeAt: string | null;
  /** The trial-end PATCH for a running comp failed: the owner must fix it in LS. */
  patchFailed: boolean;
  /** A running-comp user's new plan started 'active' (charged at checkout). */
  chargedAtCheckout: boolean;
};

/**
 * Called LAST in the subscription_created webhook (after the license backfill
 * and trial supersede, so nothing else is skipped). Records the comp-to-paid
 * conversion and, for a comp that is still running and a subscription that
 * started on its free trial, moves the LS trial end to the comp end date so the
 * first charge lands that day. Never throws: the webhook always returns 200
 * (no LS redelivery), so failures come back in the result for the caller to
 * alert on, and the comp-expiry cron retries converted grants missing
 * first_charge_at.
 */
export async function applyCompConversion(
  svc: Svc,
  input: {
    userId: string;
    lsSubscriptionId: string;
    status: string | null;
    planName: string | null;
    /** The new subscription's own trial end (from the webhook), if any. */
    trialEndsAt?: string | null;
  },
  source?: ConversionSource | null,
): Promise<ConversionResult> {
  const none: ConversionResult = { converted: false, firstChargeAt: null, patchFailed: false, chargedAtCheckout: false };
  try {
    const src = source === undefined ? await compConversionSource(svc, input.userId, input.lsSubscriptionId) : source;
    if (!src) return none;
    const { grant, keeper, extendOnly } = src;

    let firstChargeAt: string | null = null;
    let patchFailed = false;
    if (keeper && input.status === "on_trial" && grant.expiresAt) {
      const target = new Date(grant.expiresAt).getTime();
      const own = input.trialEndsAt ? new Date(input.trialEndsAt).getTime() : NaN;
      if (extendOnly && Number.isFinite(own) && own >= target) {
        firstChargeAt = new Date(own).toISOString(); // already at or after the comp end
      } else {
        const iso = new Date(target).toISOString();
        if (await setSubscriptionTrialEnd(input.lsSubscriptionId, iso)) firstChargeAt = iso;
        else patchFailed = true;
      }
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      converted_at: nowIso,
      converted_ls_subscription_id: input.lsSubscriptionId,
      converted_plan: input.planName,
      updated_at: nowIso,
    };
    if (firstChargeAt) patch.first_charge_at = firstChargeAt;
    try {
      const { error } = await svc.from("comp_grants").update(patch).eq("ls_subscription_id", grant.lsSubscriptionId);
      if (error) console.error("comp-conversion: grant stamp failed (20261108 migration applied?)", error);
    } catch (error) {
      console.error("comp-conversion: grant stamp threw", error);
    }
    return { converted: true, firstChargeAt, patchFailed, chargedAtCheckout: keeper && input.status === "active" };
  } catch (error) {
    console.error("comp-conversion: apply threw", error);
    return none;
  }
}

export type RetryOutcome = "retried" | "not_applicable" | "failed";

/**
 * Daily backstop (comp-expiry cron): a converted grant whose comp is still
 * running but has no first_charge_at means the trial-end delay never landed.
 * Only ever EXTENDS the LS trial to the comp end (never moves a charge
 * earlier). "not_applicable" (sub no longer on trial, or its trial already
 * ends at or after the comp end) is stamped so the row is not retried again.
 */
export async function retryDelayedFirstCharge(
  svc: Svc,
  args: { compLsSubscriptionId: string; paidLsSubscriptionId: string; expiresAt: string },
): Promise<RetryOutcome> {
  try {
    const res = await lsApi(`/subscriptions/${args.paidLsSubscriptionId}`, { method: "GET" });
    if (!res.ok) return "failed";
    const json = (await res.json().catch(() => null)) as
      | { data?: { attributes?: { status?: string; trial_ends_at?: string | null } } }
      | null;
    const attrs = json?.data?.attributes;
    const target = new Date(args.expiresAt).getTime();
    const own = attrs?.trial_ends_at ? new Date(attrs.trial_ends_at).getTime() : NaN;
    const stamp = async (iso: string) => {
      await svc
        .from("comp_grants")
        .update({ first_charge_at: iso, updated_at: new Date().toISOString() })
        .eq("ls_subscription_id", args.compLsSubscriptionId);
    };
    if (attrs?.status !== "on_trial") {
      await stamp(new Date().toISOString());
      return "not_applicable";
    }
    if (Number.isFinite(own) && own >= target) {
      await stamp(new Date(own).toISOString());
      return "not_applicable";
    }
    const iso = new Date(target).toISOString();
    if (!(await setSubscriptionTrialEnd(args.paidLsSubscriptionId, iso))) return "failed";
    await stamp(iso);
    return "retried";
  } catch (error) {
    console.error("comp-conversion: retryDelayedFirstCharge threw", error);
    return "failed";
  }
}
