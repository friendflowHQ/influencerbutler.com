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
      return mapGrants(retry.data ?? []);
    }
    return mapGrants(data ?? []);
  } catch {
    return [];
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

/**
 * A no-card trial comp. Before the 20261108 migration there is no `kind`, so
 * fall back to the code shape those trials are minted with (<NAME>FREE14D).
 */
export function isTrialComp(g: Pick<OpenComp, "kind" | "discountCode">): boolean {
  if (g.kind) return g.kind === "trial";
  return /FREE14D$/i.test(g.discountCode ?? "");
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

/**
 * Whether a Lemon Squeezy variant has a free trial (the vehicle for the delayed
 * first charge). null when it could not be determined.
 */
export async function variantHasFreeTrial(variantId: string): Promise<boolean | null> {
  try {
    const res = await lsApi(`/variants/${variantId}`, { method: "GET" });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as LsVariant | null;
    const v = json?.data?.attributes?.has_free_trial;
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

/**
 * The comp a brand-new paid subscription is converting from, if any.
 *
 * `keeper` (gets the delayed first charge, skips the trial drip) is true when
 * a non-trial comp is still RUNNING, whatever its kind and even before the
 * 20261108 migration adds `kind`. Otherwise the most recent non-trial comp
 * that ended (not revoked early) inside the conversion window is the source:
 * the conversion is recorded and the plan's normal LS trial applies. The new
 * subscription itself (an LS 100%-off comp checkout) never counts.
 */
export async function compConversionSource(
  svc: Svc,
  userId: string,
  newLsSubscriptionId: string,
  now: number = Date.now(),
): Promise<{ grant: OpenComp; keeper: boolean } | null> {
  const grants = await compGrantsForUser(svc, userId);
  if (grants.some((g) => g.lsSubscriptionId === newLsSubscriptionId)) return null;
  const eligible = grants.filter((g) => !isTrialComp(g));
  const running = runningComp(eligible, now);
  if (running) return { grant: running, keeper: true };
  const ended = eligible
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
  return grant ? { grant, keeper: false } : null;
}

/** Cancelled well before its end date (admin "Cancel now"), not by the expiry cron. */
function revokedEarly(g: OpenComp): boolean {
  if (!g.cancelledAt || !g.expiresAt) return false;
  const c = new Date(g.cancelledAt).getTime();
  const e = new Date(g.expiresAt).getTime();
  return Number.isFinite(c) && Number.isFinite(e) && c < e - 2 * 24 * 60 * 60 * 1000;
}

/**
 * Called from the subscription_created webhook. Records the comp-to-paid
 * conversion on the comp grant and, for a comp that is still running and a
 * subscription that started on its free trial, moves the LS trial end to the
 * comp end date so the first charge lands that day.
 *
 * Throws when that trial-end PATCH fails, so the webhook returns non-2xx and
 * Lemon Squeezy redelivers (the PATCH and the stamp are idempotent). The
 * comp-expiry cron also retries any converted grant still missing
 * first_charge_at.
 */
export async function applyCompConversion(
  svc: Svc,
  input: { userId: string; lsSubscriptionId: string; status: string | null; planName: string | null },
  source?: { grant: OpenComp; keeper: boolean } | null,
): Promise<{ converted: boolean; firstChargeAt: string | null }> {
  const src = source === undefined ? await compConversionSource(svc, input.userId, input.lsSubscriptionId) : source;
  if (!src) return { converted: false, firstChargeAt: null };
  const { grant, keeper } = src;

  let firstChargeAt: string | null = null;
  let patchFailed = false;
  if (keeper && input.status === "on_trial" && grant.expiresAt) {
    const iso = new Date(grant.expiresAt).toISOString();
    if (await setSubscriptionTrialEnd(input.lsSubscriptionId, iso)) firstChargeAt = iso;
    else patchFailed = true;
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
  if (patchFailed) {
    throw new Error(`comp-conversion: could not delay the first charge for ${input.lsSubscriptionId}; retry`);
  }
  return { converted: true, firstChargeAt };
}

/**
 * Daily backstop (comp-expiry cron): a converted grant whose comp is still
 * running but has no first_charge_at means the trial-end PATCH never landed.
 * Re-apply it while the LS subscription is still on_trial.
 */
export async function retryDelayedFirstCharge(
  svc: Svc,
  args: { compLsSubscriptionId: string; paidLsSubscriptionId: string; expiresAt: string },
): Promise<boolean> {
  try {
    const res = await lsApi(`/subscriptions/${args.paidLsSubscriptionId}`, { method: "GET" });
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { data?: { attributes?: { status?: string } } } | null;
    if (json?.data?.attributes?.status !== "on_trial") return false;
    const iso = new Date(args.expiresAt).toISOString();
    if (!(await setSubscriptionTrialEnd(args.paidLsSubscriptionId, iso))) return false;
    await svc
      .from("comp_grants")
      .update({ first_charge_at: iso, updated_at: new Date().toISOString() })
      .eq("ls_subscription_id", args.compLsSubscriptionId);
    return true;
  } catch (error) {
    console.error("comp-conversion: retryDelayedFirstCharge threw", error);
    return false;
  }
}
