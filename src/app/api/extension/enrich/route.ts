/**
 * /api/extension/enrich - Creator API product enrichment for the Chrome
 * extension.
 *
 * POST (Bearer license key): { asins: string[] } (or legacy { asin }) plus an
 * optional `marketplaces` filter -> for each marketplace the user has stored
 * Creator API credentials for, calls Creators API getItems (batched, up to 10
 * ASINs per request) and returns, per requested ASIN, one normalized row per
 * marketplace. Best-effort: Creator API credentials/partner tags are per-region
 * and the same ASIN may not exist in every marketplace, so each row reports
 * found/not-found (or a per-marketplace error) independently and one failure
 * never fails the batch.
 *
 * Auth mints a Creators API token from the decrypted credential secret
 * server-side only; the secret never leaves this process. See
 * src/lib/creators-api.ts and src/lib/creator-api-creds.ts.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import {
  ASIN_RE,
  WALMART_ITEM_ID_RE,
  parseRetailer,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";
import { loadDecryptedCreds, loadBackupCredsFor } from "@/lib/creator-api-creds";
import { getItems, GET_ITEMS_MAX, type CreatorsCreds, type EnrichedItem } from "@/lib/creators-api";
import { loadWalmartCreds, lookupItems, WALMART_LOOKUP_MAX } from "@/lib/walmart-api";

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

  const retailer = parseRetailer((body as { retailer?: unknown })?.retailer);
  if (retailer === "walmart") return enrichWalmart(body);

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

  let selected = (filter ? creds.filter((c) => filter.has(c.host)) : creds).slice(0, MARKETPLACE_CAP);

  // Fall back to leased backup credentials when the user has no own credentials
  // for the requested marketplaces. House credentials are region-scoped, so
  // loadBackupCredsFor only returns creds for a host in the lease's own group.
  if (selected.length === 0) {
    const candidateHosts = filter ? [...filter] : ["amazon.com"];
    const backup: CreatorsCreds[] = [];
    for (const host of candidateHosts.slice(0, MARKETPLACE_CAP)) {
      const c = await loadBackupCredsFor(auth.auth.userId, host);
      if (c) backup.push(c);
    }
    selected = backup;
  }

  if (selected.length === 0) {
    return jsonWithCors({ ok: true, configured: false, items: [] });
  }

  // Sequential across marketplaces to stay within the Creators API's per-second
  // throughput limits; one batched getItems call covers all ASINs per market.
  const byAsin = new Map<string, EnrichedItem[]>();
  for (const a of asins) byAsin.set(a, []);
  for (const cred of selected) {
    const rows = await getItems(cred, asins);
    for (const row of rows) {
      if (row.asin) byAsin.get(row.asin)?.push(row);
    }
  }

  const items = asins.map((asin) => ({ id: asin, asin, results: byAsin.get(asin) ?? [] }));
  return jsonWithCors({ ok: true, configured: true, items });
}

/**
 * Walmart enrichment. Unlike Amazon (per-user Associates keys, per-marketplace
 * fan-out), Walmart is a single first-party publisher credential in server env,
 * so there is one lookup with no marketplace filter. Item ids are numeric.
 * Envelope matches the Amazon path: items:[{ id, asin, results }]; `asin`
 * carries the item id so the extension's existing reader stays retailer-blind.
 */
async function enrichWalmart(body: unknown) {
  const rawIds = Array.isArray((body as { itemIds?: unknown })?.itemIds)
    ? (body as { itemIds: unknown[] }).itemIds
    : Array.isArray((body as { asins?: unknown })?.asins)
      ? (body as { asins: unknown[] }).asins
      : [(body as { itemId?: unknown })?.itemId ?? (body as { asin?: unknown })?.asin];
  const ids = [
    ...new Set(
      rawIds
        .filter((a): a is string | number => typeof a === "string" || typeof a === "number")
        .map((a) => String(a).trim())
        .filter((a) => WALMART_ITEM_ID_RE.test(a)),
    ),
  ].slice(0, WALMART_LOOKUP_MAX);
  if (ids.length === 0) return jsonWithCors({ error: "No valid Walmart item ids" }, 400);

  const creds = loadWalmartCreds();
  if (!creds) return jsonWithCors({ ok: true, configured: false, items: [] });

  const rows = await lookupItems(creds, ids);
  const byId = new Map<string, EnrichedItem>();
  for (const row of rows) if (row.itemId) byId.set(row.itemId, row);
  const items = ids.map((id) => ({
    id,
    asin: id,
    results: byId.has(id) ? [byId.get(id) as EnrichedItem] : [],
  }));
  return jsonWithCors({ ok: true, configured: true, items });
}
