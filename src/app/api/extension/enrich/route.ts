/**
 * /api/extension/enrich - PA-API product enrichment for the Chrome extension.
 *
 * POST (Bearer license key): { asins: string[] } (or legacy { asin }) plus an
 * optional `marketplaces` filter -> for each marketplace the user has stored
 * Creator API credentials for, calls PA-API GetItems (batched, up to 10 ASINs
 * per request) and returns, per requested ASIN, one normalized row per
 * marketplace. Best-effort: PA-API credentials/partner tags are per-region and
 * the same ASIN may not exist in every marketplace, so each row reports
 * found/not-found (or a per-marketplace error) independently and one failure
 * never fails the batch.
 *
 * Signing uses the decrypted secret key server-side only; the secret never
 * leaves this process. See src/lib/paapi.ts and src/lib/creator-api-creds.ts.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { ASIN_RE, jsonWithCors, migrationPendingResponse, optionsResponse } from "@/lib/extension-api";
import { loadDecryptedCreds } from "@/lib/creator-api-creds";
import { getItems, GET_ITEMS_MAX, type EnrichedItem } from "@/lib/paapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Safety cap: never fan out to more marketplaces than this per request.
const MARKETPLACE_CAP = 12;

// One request enriches at most a PA-API page of ASINs; the extension chunks a
// large storefront into this many at a time.
const ASINS_PER_REQUEST = GET_ITEMS_MAX;

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

  // Accept { asins: [...] } (batch) or legacy { asin }. Dedupe, uppercase, and
  // keep only valid ASINs.
  const rawAsins = Array.isArray((body as { asins?: unknown })?.asins)
    ? (body as { asins: unknown[] }).asins
    : [(body as { asin?: unknown })?.asin];
  const asins = [
    ...new Set(
      rawAsins
        .filter((a): a is string => typeof a === "string")
        .map((a) => a.toUpperCase())
        .filter((a) => ASIN_RE.test(a)),
    ),
  ].slice(0, ASINS_PER_REQUEST);
  if (asins.length === 0) return jsonWithCors({ error: "No valid ASINs" }, 400);

  const filterRaw = (body as { marketplaces?: unknown })?.marketplaces;
  const filter = Array.isArray(filterRaw)
    ? new Set(filterRaw.filter((m): m is string => typeof m === "string").map((m) => m.toLowerCase()))
    : null;

  const { creds, migrationPending, error } = await loadDecryptedCreds(auth.auth.userId);
  if (migrationPending) return migrationPendingResponse();
  if (error) return jsonWithCors({ error }, 500);
  if (creds.length === 0) {
    return jsonWithCors({ ok: true, configured: false, items: [] });
  }

  const selected = (filter ? creds.filter((c) => filter.has(c.host)) : creds).slice(0, MARKETPLACE_CAP);

  // Sequential across marketplaces to stay within PA-API's low per-second
  // throughput limits; one batched GetItems call covers all ASINs per market.
  const byAsin = new Map<string, EnrichedItem[]>();
  for (const a of asins) byAsin.set(a, []);
  for (const cred of selected) {
    const rows = await getItems(cred, asins);
    for (const row of rows) {
      if (row.asin) byAsin.get(row.asin)?.push(row);
    }
  }

  const items = asins.map((asin) => ({ asin, results: byAsin.get(asin) ?? [] }));
  return jsonWithCors({ ok: true, configured: true, items });
}
