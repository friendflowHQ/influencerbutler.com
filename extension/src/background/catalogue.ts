import { CATALOGUE_BASE, CATALOGUE_STALE_MS } from "../shared/constants";
import { getCache, setFilter, versionOf, type CatalogueKind } from "../catalogue/cache";
import { log } from "../shared/log";

// Refreshes the CC / SPCC membership filters from the site, at most daily.
// Sends If-None-Match with the cached version so an unchanged filter costs a
// 304 and no re-download. Runs from the background worker (content scripts do
// not call our API directly).

const KINDS: CatalogueKind[] = ["cc", "spcc"];

export async function refreshCatalogues(): Promise<void> {
  const cache = await getCache();
  for (const kind of KINDS) {
    const existing = cache[kind];
    if (existing && Date.now() - existing.fetchedAt < CATALOGUE_STALE_MS) continue;
    try {
      await refreshOne(kind, versionOf(cache, kind));
    } catch (error) {
      log("catalogue", `refresh ${kind} failed`, error);
    }
  }
}

async function refreshOne(kind: CatalogueKind, currentVersion: string | null): Promise<void> {
  const headers: Record<string, string> = {};
  if (currentVersion) headers["If-None-Match"] = `"${kind}-${currentVersion}"`;

  const response = await fetch(`${CATALOGUE_BASE}/${kind}`, { headers });
  if (response.status === 304) {
    // Unchanged: just bump the freshness stamp so we do not re-check for a day.
    const cache = await getCache();
    const existing = cache[kind];
    if (existing) await setFilter(kind, { ...existing, fetchedAt: Date.now() });
    return;
  }
  if (!response.ok) return;

  const data = (await response.json()) as {
    version?: string;
    m?: number;
    k?: number;
    bitsBase64?: string;
    notBuilt?: boolean;
    migrationPending?: boolean;
  };
  if (data.notBuilt || data.migrationPending || !data.version || !data.bitsBase64) return;

  await setFilter(kind, {
    version: data.version,
    m: data.m ?? 0,
    k: data.k ?? 0,
    bitsBase64: data.bitsBase64,
    fetchedAt: Date.now(),
  });
  log("catalogue", `refreshed ${kind} -> ${data.version}`);
}
