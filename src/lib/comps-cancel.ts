/**
 * Cancel a comped subscription and record the outcome on its comp_grants row.
 * Shared by the manual "Cancel now" button (POST /api/admin/comps/cancel) and
 * the comp-expiry cron so both cancel the same way and leave the same marker.
 *
 * Cancelling via Lemon Squeezy DELETE ends the subscription at period end; the
 * user then drops to the Free tier (see entitlements). We do NOT revoke the
 * license key - cancelling is the reversible choice.
 */
import { lsApi } from "@/lib/lemonsqueezy";
import { adminService } from "@/lib/admin-service";

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
): Promise<CancelCompResult> {
  const id = lsSubscriptionId.trim();
  if (!id) return { ok: false, status: 400, error: "Missing subscription id" };

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
