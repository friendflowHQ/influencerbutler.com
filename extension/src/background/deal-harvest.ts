import {
  DEAL_HARVEST_ASIN_CAP,
  DEAL_HARVEST_DELAY_MAX_MS,
  DEAL_HARVEST_DELAY_MIN_MS,
  DEAL_HARVEST_FETCH_TIMEOUT_MS,
  DEAL_HARVEST_URL_CAP,
  DEAL_SOURCES_STALE_MS,
  ENDPOINTS,
} from "../shared/constants";
import { extractDeals, type HarvestedDeal } from "../tools/deal-harvester/extract";
import { log } from "../shared/log";
import type { DealSource, HarvestResult } from "../shared/messages";

// Deal Sites Harvester, background half. The content script cannot fetch a
// third-party site cross-origin, so the deals page hands the URL list here and
// the worker fetches each one (the page has already prompted the user to grant
// the host permission). Fetches are sequential and jittered, credential-less
// (we never send the user's cookies to an aggregator), and time-boxed. The
// extractor is DOM-free so it runs fine in the service worker.

export async function harvestDealSites(urls: string[]): Promise<HarvestResult> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const capped = unique.length > DEAL_HARVEST_URL_CAP;
  const list = unique.slice(0, DEAL_HARVEST_URL_CAP);

  const byKey = new Map<string, HarvestedDeal>();
  const errors: HarvestResult["errors"] = [];
  let asinCapHit = false;

  for (let i = 0; i < list.length; i++) {
    if (byKey.size >= DEAL_HARVEST_ASIN_CAP) {
      asinCapHit = true;
      break;
    }
    if (i > 0) await sleep(jitteredDelay());
    const url = list[i] as string;
    try {
      const html = await fetchText(url);
      for (const deal of extractDeals(html, url)) {
        const key = `${deal.marketplace}:${deal.asin}`;
        if (!byKey.has(key)) byKey.set(key, deal);
        if (byKey.size >= DEAL_HARVEST_ASIN_CAP) {
          asinCapHit = true;
          break;
        }
      }
    } catch (error) {
      errors.push({ url, error: errorMessage(error) });
      log("deal-harvest", `fetch failed for ${url}`, error);
    }
  }

  return {
    ok: true,
    deals: [...byKey.values()],
    errors,
    capped: capped || asinCapHit,
  };
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEAL_HARVEST_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { credentials: "omit", signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// The curated aggregator list, served from our site and refreshed at most once
// a day. Falls back to the cached copy (or an empty list) if the network is
// unavailable, so the picker still works offline.
const SOURCES_KEY = "ib-deal-sources";
type SourcesCache = { fetchedAt: number; sources: DealSource[] };

export async function getDealSources(force = false): Promise<DealSource[]> {
  const cached = await readSourcesCache();
  const fresh = cached && Date.now() - cached.fetchedAt < DEAL_SOURCES_STALE_MS;
  if (cached && fresh && !force) return cached.sources;

  try {
    const res = await fetch(ENDPOINTS.dealSources);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { sources?: unknown };
    const sources = normalizeSources(data.sources);
    await chrome.storage.local.set({
      [SOURCES_KEY]: { fetchedAt: Date.now(), sources } satisfies SourcesCache,
    });
    return sources;
  } catch (error) {
    log("deal-harvest", "deal-sources refresh failed", error);
    return cached?.sources ?? [];
  }
}

async function readSourcesCache(): Promise<SourcesCache | null> {
  try {
    const out = await chrome.storage.local.get(SOURCES_KEY);
    const raw = out?.[SOURCES_KEY] as SourcesCache | undefined;
    if (raw && Array.isArray(raw.sources) && typeof raw.fetchedAt === "number") return raw;
  } catch {
    // storage read failed; treat as no cache
  }
  return null;
}

function normalizeSources(raw: unknown): DealSource[] {
  if (!Array.isArray(raw)) return [];
  const out: DealSource[] = [];
  for (const item of raw) {
    const rec = item as Record<string, unknown>;
    const url = typeof rec.url === "string" ? rec.url.trim() : "";
    if (!/^https?:\/\//i.test(url)) continue;
    out.push({
      url,
      label: typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : hostLabel(url),
    });
  }
  return out;
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function jitteredDelay(): number {
  return (
    DEAL_HARVEST_DELAY_MIN_MS +
    Math.random() * (DEAL_HARVEST_DELAY_MAX_MS - DEAL_HARVEST_DELAY_MIN_MS)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Timed out";
  return error instanceof Error ? error.message : "Fetch failed";
}
