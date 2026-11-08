// Server-only helpers for the admin Creator stores page: map links-Worker
// creator owners (SHA-256 of the license key) to website accounts via
// license_keys.key_hash -> user_id -> profiles, plus the latest subscription
// plan. Best effort: any lookup failure just leaves the account blank.

import type { SupabaseClient } from "@supabase/supabase-js";

export type CreatorAccount = {
  userId: string;
  email: string | null;
  name: string | null;
  licenseStatus: string | null;
  plan: string | null;
  planStatus: string | null;
};

const OWNER_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** owner hash -> website account, for the owners that have a license_keys row. */
export async function accountsForOwners(db: SupabaseClient, owners: string[]): Promise<Record<string, CreatorAccount>> {
  const wanted = [...new Set(owners.filter((o) => OWNER_RE.test(o)))];
  const out: Record<string, CreatorAccount> = {};
  if (!wanted.length) return out;

  const licenses: { key_hash: string; user_id: string | null; status: string | null }[] = [];
  for (let i = 0; i < wanted.length; i += 100) {
    const { data, error } = await db
      .from("license_keys")
      .select("key_hash,user_id,status")
      .in("key_hash", wanted.slice(i, i + 100));
    if (error) {
      console.error("creator-stores: license lookup failed", error);
      return out;
    }
    licenses.push(...((data ?? []) as typeof licenses));
  }
  const userIds = [...new Set(licenses.map((l) => l.user_id).filter((u): u is string => !!u))];
  if (!userIds.length) return out;

  const [profilesRes, subsRes] = await Promise.all([
    db.from("profiles").select("id,email,display_name").in("id", userIds),
    db
      .from("subscriptions")
      .select("user_id,plan_name,status,created_at")
      .in("user_id", userIds)
      .order("created_at", { ascending: false }),
  ]);
  const profiles = new Map<string, { email: string | null; display_name: string | null }>();
  for (const p of (profilesRes.data ?? []) as { id: string; email: string | null; display_name: string | null }[]) {
    profiles.set(p.id, p);
  }
  const plans = new Map<string, { plan_name: string | null; status: string | null }>();
  for (const s of (subsRes.data ?? []) as { user_id: string; plan_name: string | null; status: string | null }[]) {
    if (!plans.has(s.user_id)) plans.set(s.user_id, s);
  }

  for (const l of licenses) {
    if (!l.user_id) continue;
    const p = profiles.get(l.user_id);
    const s = plans.get(l.user_id);
    out[l.key_hash] = {
      userId: l.user_id,
      email: p?.email ?? null,
      name: p?.display_name ?? null,
      licenseStatus: l.status ?? null,
      plan: s?.plan_name ?? null,
      planStatus: s?.status ?? null,
    };
  }
  return out;
}

/** Owner hashes whose website account matches a name/email search (max 100). */
export async function ownersMatchingAccount(db: SupabaseClient, q: string): Promise<string[]> {
  const term = q.trim().replace(/[%_,()*]/g, " ").trim();
  if (term.length < 2) return [];
  const { data: profiles, error } = await db
    .from("profiles")
    .select("id")
    .or(`email.ilike.%${term}%,display_name.ilike.%${term}%`)
    .limit(50);
  if (error || !profiles?.length) return [];
  const { data: keys } = await db
    .from("license_keys")
    .select("key_hash")
    .in(
      "user_id",
      profiles.map((p) => p.id as string),
    )
    .not("key_hash", "is", null)
    .limit(100);
  return [...new Set(((keys ?? []) as { key_hash: string | null }[]).map((k) => k.key_hash).filter((k): k is string => !!k))];
}
