/**
 * Cancel a comped subscription and record the outcome on its comp_grants row.
 * Shared by the manual "Cancel now" button (POST /api/admin/comps/cancel) and
 * the comp-expiry cron so both cancel the same way and leave the same marker.
 *
 * Two kinds of comp:
 *   - Lemon Squeezy comps: cancel via LS DELETE (ends at period end).
 *   - In-house comps (ls_subscription_id starts with the `comp:` sentinel):
 *     there is no LS subscription, so we flip subscriptions.status to
 *     'cancelled' directly in Supabase, which drops the user to Free.
 * In both cases the user drops to Free (see entitlements) and we do NOT revoke
 * the license key - cancelling is the reversible choice.
 */
import { lsApi } from "@/lib/lemonsqueezy";
import { adminService } from "@/lib/admin-service";

/** In-house comps carry a synthetic ls_subscription_id `comp:<uuid>`. */
export const IN_HOUSE_SUB_PREFIX = "comp:";

export type CancelCompResult = {
  ok: boolean;
  status: number;
  error?: string;
};

/** Extra context stamped onto the comp_grants row when we cancel. */
export type CompGrantPatch = {
  userId?: string | null;
  email?: string | null;
  discountCode?: string | null;
  months?: number | null;
  monthsSource?: "parsed" | "manual" | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
};

export async function cancelCompSubscription(
  lsSubscriptionId: string,
  patch: CompGrantPatch = {},
  source?: "in_house" | "lemonsqueezy" | null,
): Promise<CancelCompResult> {
  const id = lsSubscriptionId.trim();
  if (!id) return { ok: false, status: 400, error: "Missing subscription id" };

  // In-house comps have no LS subscription; flip the Supabase status instead.
  if (source === "in_house" || id.startsWith(IN_HOUSE_SUB_PREFIX)) {
    return cancelInHouseComp(id, patch);
  }

  let res: Response;
  try {
    res = await lsApi(`/subscriptions/${id}`, { method: "DELETE" });
  } catch (error) {
    console.error("cancelCompSubscription: lsApi threw", error);
    return { ok: false, status: 502, error: "Payment provider request failed" };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("cancelCompSubscription: LS cancel failed", {
      status: res.status,
      text: text.slice(0, 500),
    });
    // Best-effort: still stamp the failure so the cron does not hammer LS.
    await stampGrant(id, patch, `error:${res.status}`, null);
    return { ok: false, status: 502, error: "Failed to cancel with payment provider" };
  }

  const nowIso = new Date().toISOString();
  await stampGrant(id, patch, "ok", nowIso);
  return { ok: true, status: 200 };
}

/**
 * Cancel an in-house comp: flip its synthetic subscription to 'cancelled' in
 * Supabase (entitlements then drops the user to Free) and stamp the grant. No
 * Lemon Squeezy call. The license key is left intact (reversible), matching the
 * LS path.
 */
async function cancelInHouseComp(
  sentinel: string,
  patch: CompGrantPatch,
): Promise<CancelCompResult> {
  const svc = adminService();
  if (!svc) return { ok: false, status: 503, error: "Server misconfigured" };
  const nowIso = new Date().toISOString();
  try {
    const { error } = await svc
      .from("subscriptions")
      .update({ status: "cancelled", ends_at: nowIso })
      .eq("ls_subscription_id", sentinel);
    if (error) {
      console.error("cancelInHouseComp: subscriptions update failed", error);
      await stampGrant(sentinel, patch, "error:update", null);
      return { ok: false, status: 500, error: "Failed to cancel the comp" };
    }
  } catch (error) {
    console.error("cancelInHouseComp: subscriptions update threw", error);
    return { ok: false, status: 500, error: "Failed to cancel the comp" };
  }
  await stampGrant(sentinel, patch, "ok", nowIso);
  return { ok: true, status: 200 };
}

async function stampGrant(
  lsSubscriptionId: string,
  patch: CompGrantPatch,
  cancelResult: string,
  cancelledAt: string | null,
): Promise<void> {
  const svc = adminService();
  if (!svc) return;
  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    ls_subscription_id: lsSubscriptionId,
    cancel_result: cancelResult,
    updated_at: nowIso,
  };
  if (cancelledAt) payload.cancelled_at = cancelledAt;
  if (patch.userId != null) payload.user_id = patch.userId;
  if (patch.email != null) payload.user_email = patch.email;
  if (patch.discountCode != null) payload.discount_code = patch.discountCode;
  if (patch.months != null) payload.months = patch.months;
  if (patch.monthsSource != null) payload.months_source = patch.monthsSource;
  if (patch.issuedAt != null) payload.issued_at = patch.issuedAt;
  if (patch.expiresAt != null) payload.expires_at = patch.expiresAt;
  try {
    const { error } = await svc.from("comp_grants").upsert(payload, {
      onConflict: "ls_subscription_id",
    });
    if (error) console.error("cancelCompSubscription: grant upsert failed", error);
  } catch (error) {
    console.error("cancelCompSubscription: grant upsert threw", error);
  }
}
