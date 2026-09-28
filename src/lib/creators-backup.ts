/**
 * creators-backup.ts - leases Influencer Butler's house Amazon Creator API
 * credentials from the licensing Worker.
 *
 * When Amazon has not unlocked the Creator API for a user's own account yet (a
 * new account has to make a few qualifying sales first), the user can lease the
 * house credentials on a short expiring lease so enrichment works in the
 * meantime. This is the same endpoint the desktop app uses; it is license-gated
 * on the Worker side and returns nothing without a valid license key.
 *
 * The Worker holds the actual house credentials as env secrets
 * (CREATORS_BACKUP_*); this module only relays the lease. See the desktop repo's
 * workers/licensing/src/routes/creatorsBackup.js for the issuer.
 */

const DEFAULT_WORKER_URL = "https://licensing.influencerbutler.com";

function workerBase(): string {
  return (process.env.BB_LICENSING_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

export type LeasedCreds = {
  clientId: string;
  clientSecret: string;
  credentialVersion: string;
  partnerTag: string;
  marketplace: string;
};

export type LeaseResult =
  | { ok: true; credentials: LeasedCreds; expiresAt: number }
  | { ok: false; error: string };

// Lease the house Creator API credentials. `keyValue` is the caller's raw
// license key (the Bearer token the extension already presents). The Worker
// validates it and, when backup is enabled + configured, returns the credentials
// plus a lease expiry (epoch ms).
export async function leaseBackupCreds(keyValue: string): Promise<LeaseResult> {
  const key = String(keyValue ?? "").trim();
  if (!key) return { ok: false, error: "license_key_required" };
  try {
    const res = await fetch(`${workerBase()}/license/creators-backup-credentials`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ keyValue: key }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = (await res.json().catch(() => null)) as
      | { ok?: boolean; error?: string; credentials?: Partial<LeasedCreds>; expiresAt?: number }
      | null;
    if (!data || data.ok !== true || !data.credentials) {
      return { ok: false, error: data?.error || `lease_failed_${res.status}` };
    }
    const c = data.credentials;
    if (!c.clientId || !c.clientSecret || !c.partnerTag) {
      return { ok: false, error: "unconfigured" };
    }
    return {
      ok: true,
      credentials: {
        clientId: c.clientId,
        clientSecret: c.clientSecret,
        credentialVersion: c.credentialVersion || "3.2",
        partnerTag: c.partnerTag,
        marketplace: c.marketplace || "www.amazon.com",
      },
      expiresAt: typeof data.expiresAt === "number" ? data.expiresAt : Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
  } catch {
    return { ok: false, error: "lease_unreachable" };
  }
}
