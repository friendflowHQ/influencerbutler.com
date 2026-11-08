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
