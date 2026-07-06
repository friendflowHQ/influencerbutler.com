/**
 * /api/extension/creator-api - the Chrome extension's Creator API (PA-API)
 * credential vault endpoint.
 *
 * GET  (Bearer license key): status only - which marketplaces are configured
 *      and when they were last updated. NEVER returns any secret.
 * POST (Bearer license key):
 *      { marketplaces: [{ host, partnerTag, accessKeyId, secretKey }] } -> save
 *      { action: "delete" } -> remove all stored credentials
 *
 * Secrets are encrypted at rest (AES-256-GCM) before hitting the DB; signing
 * happens only in /api/extension/enrich. See src/lib/creator-api-creds.ts.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { jsonWithCors, migrationPendingResponse, optionsResponse } from "@/lib/extension-api";
import {
  deleteCreds,
  getStatus,
  saveCreds,
  validateIncoming,
  type IncomingMarketplaceCreds,
} from "@/lib/creator-api-creds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MARKETPLACES = 18;

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const { status, migrationPending, error } = await getStatus(auth.auth.userId);
  if (migrationPending) return migrationPendingResponse();
  if (error) return jsonWithCors({ error }, 500);
  return jsonWithCors({ ok: true, ...status });
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

  if ((body as { action?: string })?.action === "delete") {
    const result = await deleteCreds(auth.auth.userId);
    if (!result.ok && result.migrationPending) return migrationPendingResponse();
    if (!result.ok) return jsonWithCors({ error: result.error }, 500);
    return jsonWithCors({ ok: true, deleted: true });
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
