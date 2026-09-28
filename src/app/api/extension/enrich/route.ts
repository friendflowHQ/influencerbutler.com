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
import { getItems, GET_ITEMS_MAX, type EnrichedItem } from "@/lib/creators-api";
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

  const own = (filter ? creds.filter((c) => filter.has(c.host)) : creds).slice(0, MARKETPLACE_CAP);

  // Run the user's own credentials first. Track whether any marketplace actually
  // returned a found item: a new Associates account can hold valid credentials
  // that Amazon has not unlocked Creator API access for yet, in which case every
  // row comes back not-found and the leased backup credentials should take over.
  // Sequential across marketplaces to stay within the Creators API's per-second
  // throughput limits; one batched getItems call covers all ASINs per market.
  const byAsin = new Map<string, EnrichedItem[]>();
  for (const a of asins) byAsin.set(a, []);
  let ownFoundAny = false;
  for (const cred of own) {
    const rows = await getItems(cred, asins);
    for (const row of rows) {
      if (row.asin) byAsin.get(row.asin)?.push(row);
      if (row.found) ownFoundAny = true;
    }
  }

  // Backup fallback: when the user has no own credentials for the requested
  // marketplaces, OR has them but they returned nothing usable (eligibility not
  // unlocked yet), fill in from the leased house credentials. Without this, a
  // vault holding not-yet-unlocked own creds would shadow a working backup lease
  // and every enrichment would come back empty. House credentials are
  // region-scoped, so loadBackupCredsFor only returns creds for a host in the
  // lease's own group.
  let backupConfigured = false;
  if (!ownFoundAny) {
    const candidateHosts = (
      filter ? [...filter] : own.length ? own.map((c) => c.host) : ["amazon.com"]
    ).slice(0, MARKETPLACE_CAP);
    const backupByAsin = new Map<string, EnrichedItem[]>();
    for (const a of asins) backupByAsin.set(a, []);
    let backupFoundAny = false;
    for (const host of candidateHosts) {
      const c = await loadBackupCredsFor(auth.auth.userId, host);
      if (!c) continue;
      backupConfigured = true;
      const rows = await getItems(c, asins);
      for (const row of rows) {
        if (row.asin) backupByAsin.get(row.asin)?.push(row);
        if (row.found) backupFoundAny = true;
      }
    }
    // Swap in the backup rows only when they carry real data, so a transient
    // backup miss does not discard the own not-found rows already collected.
    if (backupFoundAny) {
      for (const a of asins) byAsin.set(a, backupByAsin.get(a) ?? []);
    }
  }

  // "Configured" means the user has some credential source at all (their own, or
  // an active backup lease), so the extension only shows the connect prompt when
  // neither is set up: a configured-but-empty result is not "go connect".
  const configured = own.length > 0 || backupConfigured;
  if (!configured) {
    return jsonWithCors({ ok: true, configured: false, items: [] });
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
