/**
 * /api/extension/creator-api - the Chrome extension's Creator API credential
 * vault endpoint.
 *
 * GET  (Bearer license key): status only - which marketplaces are configured
 *      and when they were last updated. NEVER returns any secret.
 * POST (Bearer license key):
 *      { marketplaces: [{ host, partnerTag, credentialId, credentialSecret,
 *        credentialVersion }] } -> save
 *      { action: "delete" } -> remove all stored credentials
 *
 * Secrets are encrypted at rest (AES-256-GCM) before hitting the DB; the token
 * is minted only in /api/extension/enrich. See src/lib/creator-api-creds.ts.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { jsonWithCors, migrationPendingResponse, optionsResponse } from "@/lib/extension-api";
import {
  clearBackup,
  deleteCreds,
  getBackupStatus,
  getStatus,
  saveBackup,
  saveCreds,
  validateIncoming,
  type IncomingMarketplaceCreds,
} from "@/lib/creator-api-creds";
import { leaseBackupCreds } from "@/lib/creators-backup";

const BEARER_RE = /^Bearer\s+(.+)$/i;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MARKETPLACES = 24;

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const { status, migrationPending, error } = await getStatus(auth.auth.userId);
  if (migrationPending) return migrationPendingResponse();
  if (error) return jsonWithCors({ error }, 500);
  const { status: backup } = await getBackupStatus(auth.auth.userId);
  return jsonWithCors({ ok: true, ...status, backup });
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const action = (body as { action?: string })?.action;

  if (action === "delete") {
    const result = await deleteCreds(auth.auth.userId);
    if (!result.ok && result.migrationPending) return migrationPendingResponse();
    if (!result.ok) return jsonWithCors({ error: result.error }, 500);
    return jsonWithCors({ ok: true, deleted: true });
  }

  // Backup-credential leasing: enable leases the house credentials from the
  // licensing Worker (using the caller's raw license key), disable clears them,
  // status just reports the current lease.
  if (action === "backup-enable" || action === "backup-disable" || action === "backup-status") {
    if (action === "backup-disable") {
      const result = await clearBackup(auth.auth.userId);
      if (!result.ok && result.migrationPending) return migrationPendingResponse();
      if (!result.ok) return jsonWithCors({ error: result.error }, 500);
      return jsonWithCors({ ok: true, backup: { enabled: false, active: false, expiresAt: null } });
    }
    if (action === "backup-enable") {
      const keyValue = BEARER_RE.exec(request.headers.get("authorization") ?? "")?.[1] ?? "";
      const lease = await leaseBackupCreds(keyValue);
      if (!lease.ok) return jsonWithCors({ ok: false, error: lease.error }, 400);
      const saved = await saveBackup(auth.auth.userId, {
        clientId: lease.credentials.clientId,
        clientSecret: lease.credentials.clientSecret,
        credentialVersion: lease.credentials.credentialVersion,
        partnerTag: lease.credentials.partnerTag,
        marketplace: lease.credentials.marketplace,
        expiresAt: lease.expiresAt,
      });
      if (!saved.ok && saved.migrationPending) return migrationPendingResponse();
      if (!saved.ok) return jsonWithCors({ error: saved.error }, 500);
    }
    const { status, migrationPending, error } = await getBackupStatus(auth.auth.userId);
    if (migrationPending) return migrationPendingResponse();
    if (error) return jsonWithCors({ error }, 500);
    return jsonWithCors({ ok: true, backup: status });
  }

  const rawList = (body as { marketplaces?: unknown })?.marketplaces;
  if (!Array.isArray(rawList) || rawList.length === 0 || rawList.length > MAX_MARKETPLACES) {
    return jsonWithCors({ error: `marketplaces must be an array of 1-${MAX_MARKETPLACES}` }, 400);
  }

  const incoming: IncomingMarketplaceCreds[] = [];
  const seen = new Set<string>();
  for (const raw of rawList) {
    const valid = validateIncoming(raw);
    if (!valid) return jsonWithCors({ error: "One or more marketplace entries are invalid" }, 400);
    if (seen.has(valid.host)) continue; // last write per host is enough; dedupe
    seen.add(valid.host);
    incoming.push(valid);
  }

  const result = await saveCreds(auth.auth.userId, incoming);
  if (!result.ok && result.migrationPending) return migrationPendingResponse();
  if (!result.ok) return jsonWithCors({ error: result.error }, 500);

  const { status } = await getStatus(auth.auth.userId);
  return jsonWithCors({ ok: true, ...status });
}
