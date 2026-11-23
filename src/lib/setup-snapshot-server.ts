// Database access behind src/lib/setup-snapshot.ts (kept apart so the rules stay
// pure and unit-tested). The setup_snapshots table is applied by hand in prod
// (supabase/migrations/20261124_setup_snapshots.sql); until it is, every read
// returns null and every write reports failure, so booking falls back to the
// checklist checkboxes and the desktop app just retries later.

import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeSnapshot, type SetupSnapshot } from "@/lib/setup-snapshot";

export type StoredSnapshot = { snapshot: SetupSnapshot; updatedAt: string };

/** The customer's latest snapshot, or null when none exists or the lookup fails (fails open). */
export async function readSetupSnapshot(db: SupabaseClient, userId: string): Promise<StoredSnapshot | null> {
  try {
    const { data, error } = await db
      .from("setup_snapshots").select("snapshot,updated_at").eq("user_id", userId).maybeSingle();
    if (error || !data) return null;
    // Re-clean what comes back: the row is only ever written by saveSetupSnapshot, but never trust storage shape.
    const snapshot = sanitizeSnapshot((data as { snapshot?: unknown }).snapshot);
    const updatedAt = String((data as { updated_at?: string }).updated_at || "");
    return snapshot && updatedAt ? { snapshot, updatedAt } : null;
  } catch {
    return null;
  }
}

/** Replace the customer's snapshot. Returns false when the table is missing or the write fails. */
export async function saveSetupSnapshot(db: SupabaseClient, userId: string, snapshot: SetupSnapshot): Promise<boolean> {
  try {
    const { error } = await db
      .from("setup_snapshots")
      .upsert({ user_id: userId, snapshot, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (error) {
      console.error("[setup-snapshot] save", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[setup-snapshot] save", e);
    return false;
  }
}
