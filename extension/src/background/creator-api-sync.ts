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

async function licenseKey(): Promise<string | null> {
  const state = await getState();
  return state.auth.licenseKey || null;
}

// Save the given credential sets to the server vault. A no-op (returns false)
// when the user is not signed in or there is nothing configured to push.
export async function pushCreatorApiCreds(entries: VaultEntry[]): Promise<boolean> {
  const complete = entries.filter(
    (e) => e.host && e.partnerTag && e.credentialId && e.credentialSecret,
  );
  const key = await licenseKey();
  if (!key || complete.length === 0) return false;
  try {
    const res = await fetch(ENDPOINTS.creatorApi, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ marketplaces: complete }),
    });
    return res.ok;
  } catch {
    return false;
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
