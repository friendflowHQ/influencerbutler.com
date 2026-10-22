import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared read/write for profiles.dashboard_dismissals (JSONB, migration
 * 20261022): a flat map of banner-key -> ISO dismissed-at timestamp, used by
 * every dashboard banner that needs dismissal to survive a new login rather
 * than just the current browser session.
 */
type Dismissals = Record<string, string>;

export async function readBannerDismissals(
  admin: SupabaseClient,
  userId: string,
): Promise<{ dismissals: Dismissals; persisted: boolean }> {
  try {
    const { data, error } = await admin
      .from("profiles")
      .select("dashboard_dismissals")
      .eq("id", userId)
      .maybeSingle();
    if (error) return { dismissals: {}, persisted: false };
    const raw = (data as { dashboard_dismissals?: unknown } | null)?.dashboard_dismissals;
    const dismissals = raw && typeof raw === "object" ? (raw as Dismissals) : {};
    return { dismissals, persisted: true };
  } catch {
    return { dismissals: {}, persisted: false };
  }
}

export async function writeBannerDismissal(
  admin: SupabaseClient,
  userId: string,
  key: string,
): Promise<{ ok: boolean; persisted: boolean }> {
  const { dismissals, persisted } = await readBannerDismissals(admin, userId);
  if (!persisted) return { ok: true, persisted: false };

  const next: Dismissals = { ...dismissals, [key]: new Date().toISOString() };
  try {
    const { error } = await admin.from("profiles").update({ dashboard_dismissals: next }).eq("id", userId);
    if (error) return { ok: true, persisted: false };
  } catch {
    return { ok: true, persisted: false };
  }
  return { ok: true, persisted: true };
}
