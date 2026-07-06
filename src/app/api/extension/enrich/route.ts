/**
 * /api/extension/enrich - PA-API product enrichment for the Chrome extension.
 *
 * POST (Bearer license key): { asin, marketplaces? } -> for each marketplace
 * the user has stored Creator API credentials for (optionally filtered by the
 * `marketplaces` list), calls PA-API GetItems for the ASIN and returns a
 * normalized row. Best-effort across marketplaces: PA-API credentials/partner
 * tags are per-region, and the same ASIN may not exist in every marketplace,
 * so each row reports found/not-found (or a per-marketplace error)
 * independently and one failure never fails the batch.
 *
 * Signing uses the decrypted secret key server-side only; the secret never
 * leaves this process. See src/lib/paapi.ts and src/lib/creator-api-creds.ts.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { ASIN_RE, jsonWithCors, migrationPendingResponse, optionsResponse } from "@/lib/extension-api";
import { loadDecryptedCreds } from "@/lib/creator-api-creds";
import { getItems } from "@/lib/paapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safety cap: never fan out to more marketplaces than this per request.
const MARKETPLACE_CAP = 12;

export async function OPTIONS() {
  return optionsResponse();
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
  const asin = typeof (body as { asin?: unknown })?.asin === "string"
    ? (body as { asin: string }).asin.toUpperCase()
    : "";
  if (!ASIN_RE.test(asin)) return jsonWithCors({ error: "Invalid ASIN" }, 400);

  const filterRaw = (body as { marketplaces?: unknown })?.marketplaces;
  const filter = Array.isArray(filterRaw)
    ? new Set(filterRaw.filter((m): m is string => typeof m === "string").map((m) => m.toLowerCase()))
    : null;

  const { creds, migrationPending, error } = await loadDecryptedCreds(auth.auth.userId);
  if (migrationPending) return migrationPendingResponse();
  if (error) return jsonWithCors({ error }, 500);
  if (creds.length === 0) {
    return jsonWithCors({ ok: true, configured: false, results: [] });
  }

  const selected = (filter ? creds.filter((c) => filter.has(c.host)) : creds).slice(0, MARKETPLACE_CAP);

  // Sequential to stay within PA-API's low per-second throughput limits.
  const results = [];
  for (const cred of selected) {
    results.push(await getItems(cred, asin));
  }

  return jsonWithCors({ ok: true, configured: true, asin, results });
}
