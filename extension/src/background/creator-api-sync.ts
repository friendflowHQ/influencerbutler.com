import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";

// Push the user's Creator API credentials to the server vault, and drive the
// backup-credential lease. The server holds the encrypted secret and mints the
// OAuth token for enrichment; the browser only relays. All calls carry the
// signed-in license key as a Bearer token.

export type VaultEntry = {
  host: string; // bare marketplace host, e.g. "amazon.com"
  partnerTag: string;
  credentialId: string;
  credentialSecret: string;
  credentialVersion: string;
};

export type BackupStatus = { enabled: boolean; active: boolean; expiresAt: number | null };

export type VaultStatus = { configured: boolean; marketplaces: string[] };

// Why a credential push did not land. The options page turns this into a line
// the user can act on, so the reasons are the ones that need different actions:
// sign in, wait for us, or retry.
export type VaultSyncReason = "signed-out" | "incomplete" | "migration" | "server" | "network";

export type VaultPushResult = { ok: true } | { ok: false; reason: VaultSyncReason; message?: string };

// Persisted record of the last credential push: whether one is still owed (it
// was attempted but did not land - offline at save time, a network blip, the
// migration not applied yet, our encryption key missing) and why. The reconciler
// drains `pending` so the vault self-heals instead of leaving local creds that
// pass the in-card Test but never reach server-side enrichment, and the Settings
// card renders `reason` so the failure is visible rather than silent.
const VAULT_SYNC_KEY = "ib-creator-vault-sync";

export type VaultSyncState = {
  pending: boolean;
  reason: VaultSyncReason | null;
  message: string | null;
  at: number | null;
};

const NO_SYNC_OWED: VaultSyncState = { pending: false, reason: null, message: null, at: null };

async function licenseKey(): Promise<string | null> {
  const state = await getState();
  return state.auth.licenseKey || null;
}

// Record the outcome of a push. A successful (or not-owed) sync clears the whole
// record so the card stops warning about a failure that no longer applies.
export async function setVaultSyncState(state: VaultSyncState | null): Promise<void> {
  try {
    if (state && state.pending) await chrome.storage.local.set({ [VAULT_SYNC_KEY]: state });
    else await chrome.storage.local.remove(VAULT_SYNC_KEY);
  } catch {
    // storage unavailable in this context: nothing we can do, and a missing
    // record just means the next full reconcile re-checks the server anyway.
  }
}

export async function getVaultSyncState(): Promise<VaultSyncState> {
  try {
    const raw = await chrome.storage.local.get(VAULT_SYNC_KEY);
    const stored = raw[VAULT_SYNC_KEY] as Partial<VaultSyncState> | undefined;
    if (!stored || stored.pending !== true) return NO_SYNC_OWED;
    return {
      pending: true,
      reason: (stored.reason as VaultSyncReason) ?? null,
      message: typeof stored.message === "string" ? stored.message : null,
      at: typeof stored.at === "number" ? stored.at : null,
    };
  } catch {
    return NO_SYNC_OWED;
  }
}

// Cheap "is a retry owed?" check for the sync alarm, which runs often and should
// not decrypt credentials just to find there is nothing to do.
export async function isVaultSyncPending(): Promise<boolean> {
  return (await getVaultSyncState()).pending;
}

// Read which marketplaces the server vault currently holds for this user. Lets
// the reconciler notice a divergence (local creds configured, server missing
// them) even when no pending flag was recorded. Returns null when unavailable
// (not signed in, offline, migration pending), which the caller treats as
// "unknown", not "empty".
export async function fetchVaultStatus(): Promise<VaultStatus | null> {
  const key = await licenseKey();
  if (!key) return null;
  try {
    const res = await fetch(ENDPOINTS.creatorApi, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; configured?: boolean; marketplaces?: unknown }
      | null;
    if (!data || data.ok === false) return null;
    return {
      configured: Boolean(data.configured),
      marketplaces: Array.isArray(data.marketplaces)
        ? data.marketplaces.filter((m): m is string => typeof m === "string")
        : [],
    };
  } catch {
    return null;
  }
}

// Save the given credential sets to the server vault.
//
// The response body is the authority, not the HTTP status: a "migration not
// applied yet" soft-fail answers 200 with { ok: false, migrationPending: true }
// and stores nothing. Reading res.ok alone would record that as a success and
// drop the retry, which is how credentials that pass the in-card Test end up
// never reaching server-side enrichment.
export async function pushCreatorApiCreds(entries: VaultEntry[]): Promise<VaultPushResult> {
  const complete = entries.filter(
    (e) => e.host && e.partnerTag && e.credentialId && e.credentialSecret,
  );
  const key = await licenseKey();
  if (!key) return { ok: false, reason: "signed-out" };
  if (complete.length === 0) return { ok: false, reason: "incomplete" };
  try {
    const res = await fetch(ENDPOINTS.creatorApi, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ marketplaces: complete }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; migrationPending?: boolean; error?: string }
      | null;
    if (data?.migrationPending) return { ok: false, reason: "migration", message: data.error };
    if (!res.ok || data?.ok === false) {
      return { ok: false, reason: "server", message: data?.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: "network" };
  }
}

// Remove all stored credentials from the server vault (mirrors "Clear saved
// keys" locally).
export async function clearCreatorApiVault(): Promise<boolean> {
  const key = await licenseKey();
  if (!key) return false;
  try {
    const res = await fetch(ENDPOINTS.creatorApi, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ action: "delete" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Enable / disable / read the backup-credential lease. Returns the current
// status, or null when unavailable (not signed in, or the request failed).
export async function backupAction(
  action: "backup-enable" | "backup-disable" | "backup-status",
): Promise<BackupStatus | { error: string } | null> {
  const key = await licenseKey();
  if (!key) return null;
  try {
    const res = await fetch(ENDPOINTS.creatorApi, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ action }),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; backup?: BackupStatus }
      | null;
    if (!data) return null;
    if (data.ok === false) return { error: data.error || "backup_failed" };
    return data.backup ?? null;
  } catch {
    return null;
  }
}
