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

/** Comp kinds whose paid checkout gets the delayed first charge (and skips the trial drip). */
const KEEPER_KINDS = new Set(["winback", "creator"]);
/** A comp that ended this long ago still counts as the source of a conversion. */
const CONVERSION_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * The comp a brand-new paid subscription is converting from, if any: the
 * user's most recent non-trial comp that is still running or ended within the
 * conversion window. The new subscription itself (an LS 100%-off comp checkout)
 * never counts. `keeper` is true for win-back / creator comps, which get the
 * delayed first charge.
 */
export async function compConversionSource(
  svc: Svc,
  userId: string,
  newLsSubscriptionId: string,
  now: number = Date.now(),
): Promise<{ grant: OpenComp; keeper: boolean } | null> {
  const grants = await compGrantsForUser(svc, userId);
  if (grants.some((g) => g.lsSubscriptionId === newLsSubscriptionId)) return null;
  const candidates = grants
    .filter((g) => g.kind !== "trial")
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
  const grant = candidates[0];
  if (!grant) return null;
  return { grant, keeper: grant.kind != null && KEEPER_KINDS.has(grant.kind) };
}

/**
 * Called from the subscription_created webhook. Records the comp-to-paid
 * conversion on the comp grant and, for a win-back / creator comp that is still
 * running and a subscription that started on its free trial, moves the LS
 * trial end to the comp end date so the first charge lands that day.
 *
 * Best-effort and non-throwing: a failure here must never fail the webhook.
 */
export async function applyCompConversion(
  svc: Svc,
  input: { userId: string; lsSubscriptionId: string; status: string | null; planName: string | null },
  source?: { grant: OpenComp; keeper: boolean } | null,
): Promise<{ converted: boolean; firstChargeAt: string | null }> {
  try {
    const src = source === undefined ? await compConversionSource(svc, input.userId, input.lsSubscriptionId) : source;
    if (!src) return { converted: false, firstChargeAt: null };
    const { grant, keeper } = src;

    let firstChargeAt: string | null = null;
    const end = grant.expiresAt ? new Date(grant.expiresAt).getTime() : NaN;
    // Only push the trial end when the comp still has more than an hour left.
    if (keeper && input.status === "on_trial" && Number.isFinite(end) && end > Date.now() + 60 * 60 * 1000) {
      const iso = new Date(end).toISOString();
      try {
        const res = await lsApi(`/subscriptions/${input.lsSubscriptionId}`, {
          method: "PATCH",
          body: JSON.stringify({
            data: { type: "subscriptions", id: String(input.lsSubscriptionId), attributes: { trial_ends_at: iso } },
          }),
        });
        if (res.ok) firstChargeAt = iso;
        else {
          const text = await res.text().catch(() => "");
          console.error("comp-conversion: trial_ends_at PATCH failed", {
            status: res.status,
            sub: input.lsSubscriptionId,
            text: text.slice(0, 300),
          });
        }
      } catch (error) {
        console.error("comp-conversion: trial_ends_at PATCH threw", error);
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
    const { error } = await svc.from("comp_grants").update(patch).eq("ls_subscription_id", grant.lsSubscriptionId);
    if (error) console.error("comp-conversion: grant stamp failed (20261108 migration applied?)", error);
    return { converted: !error, firstChargeAt };
  } catch (error) {
    console.error("comp-conversion: apply threw", error);
    return { converted: false, firstChargeAt: null };
  }
}
