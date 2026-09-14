import {
  DEAL_HARVEST_ASIN_CAP,
  DEAL_HARVEST_DELAY_MAX_MS,
  DEAL_HARVEST_DELAY_MIN_MS,
  DEAL_HARVEST_FETCH_TIMEOUT_MS,
  DEAL_HARVEST_RENDER_CAP,
  DEAL_HARVEST_RENDER_SETTLE_MS,
  DEAL_HARVEST_RENDER_TIMEOUT_MS,
  DEAL_HARVEST_SHORTLINK_CAP,
  DEAL_HARVEST_SHORTLINK_DELAY_MAX_MS,
  DEAL_HARVEST_SHORTLINK_DELAY_MIN_MS,
  DEAL_HARVEST_URL_CAP,
  DEAL_SOURCES_STALE_MS,
  ENDPOINTS,
} from "../shared/constants";
import {
  dealFromAmazonUrl,
  extractDeals,
  extractShortLinks,
  type HarvestedDeal,
} from "../tools/deal-harvester/extract";
import { log } from "../shared/log";
import type { DealSource, EnrichResult, HarvestResult } from "../shared/messages";
import { enrichProducts } from "./enrich";
import { enqueue, flush } from "../transport/router";
import { getSettings } from "../storage/store";
import type { DealFinding, Finding } from "../transport/types";

// Deal Sites Harvester, background half. The content script cannot fetch a
// third-party site cross-origin, so the deals page hands the URL list here and
// the worker fetches each one (the page has already prompted the user to grant
// the host permission). Fetches are sequential and jittered, credential-less
// (we never send the user's cookies to an aggregator), and time-boxed. The
// extractor is DOM-free so it runs fine in the service worker.

export async function harvestDealSites(
  urls: string[],
  opts: { render?: boolean } = {},
): Promise<HarvestResult> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))];
  const capped = unique.length > DEAL_HARVEST_URL_CAP;
  const list = unique.slice(0, DEAL_HARVEST_URL_CAP);

  const byKey = new Map<string, HarvestedDeal>();
  const errors: HarvestResult["errors"] = [];
  // Amazon short links seen per page, resolved after the page sweep. Value is
  // the aggregator page the link was found on (first sighting wins) so the
  // resolved deal is attributed to the right source in the review list.
  const shortLinks = new Map<string, string>();
  // Attempted URLs that produced nothing (no deals, no short links) from the
  // plain fetch: the deep-scan candidates.
  const emptyUrls = new Set<string>();
  let asinCapHit = false;

  // Pull deals + short links out of one page's HTML into the shared maps, and
  // mark the source URL non-empty if it contributed anything. Reused by both
  // the fetch pass and the render pass so they extract identically.
  const absorb = (html: string, url: string): void => {
    let got = 0;
    for (const deal of extractDeals(html, url)) {
      const key = `${deal.marketplace}:${deal.asin}`;
      if (!byKey.has(key)) byKey.set(key, deal);
      got += 1;
      if (byKey.size >= DEAL_HARVEST_ASIN_CAP) {
        asinCapHit = true;
        break;
      }
    }
    for (const link of extractShortLinks(html)) {
      if (!shortLinks.has(link)) {
        shortLinks.set(link, url);
        got += 1;
      }
    }
    if (got > 0) emptyUrls.delete(url);
  };

  for (let i = 0; i < list.length; i++) {
    if (byKey.size >= DEAL_HARVEST_ASIN_CAP) {
      asinCapHit = true;
      break;
    }
    if (i > 0) await sleep(jitteredDelay());
    const url = list[i] as string;
    emptyUrls.add(url);
    try {
      const html = await fetchText(url);
      absorb(html, url);
    } catch (error) {
      errors.push({ url, error: errorMessage(error) });
      log("deal-harvest", `fetch failed for ${url}`, error);
    }
  }

  // Deep scan (opt-in): re-read the zero-yield sites in a real background tab so
  // JavaScript-rendered deal lists (invisible to a plain fetch) are captured.
  // Heavy (a whole tab per site) and it visits the site in the user's own
  // session, so it is capped tightly and only ever runs on sites that came back
  // empty. `rendered` lists the sites we deep-scanned so the UI can note it.
  let rendered: string[] | undefined;
  if (opts.render && emptyUrls.size > 0 && byKey.size < DEAL_HARVEST_ASIN_CAP) {
    rendered = [];
    const candidates = [...emptyUrls].slice(0, DEAL_HARVEST_RENDER_CAP);
    if (emptyUrls.size > candidates.length) asinCapHit = true; // some left unscanned
    for (const url of candidates) {
      if (byKey.size >= DEAL_HARVEST_ASIN_CAP) {
        asinCapHit = true;
        break;
      }
      const html = await renderDealSite(url);
      rendered.push(url);
      if (html) {
        // The tab read succeeded, so drop any earlier plain-fetch error for it.
        const idx = errors.findIndex((e) => e.url === url);
        if (idx >= 0) errors.splice(idx, 1);
        absorb(html, url);
      }
    }
  }

  // Resolve short links (amzn.to / a.co) into real product URLs. Deal sites use
  // these heavily; without this pass a site whose links are all shortened
  // yields zero deals. Best-effort per link: a dead or bot-walled link is
  // skipped, never surfaced as a page error.
  if (shortLinks.size > 0 && byKey.size < DEAL_HARVEST_ASIN_CAP) {
    let resolved = 0;
    for (const [link, sourceUrl] of shortLinks) {
      if (resolved >= DEAL_HARVEST_SHORTLINK_CAP) {
        asinCapHit = true;
        break;
      }
      if (byKey.size >= DEAL_HARVEST_ASIN_CAP) {
        asinCapHit = true;
        break;
      }
      if (resolved > 0) await sleep(shortLinkDelay());
      resolved += 1;
      try {
        const finalUrl = await resolveRedirect(link);
        const deal = finalUrl ? dealFromAmazonUrl(finalUrl, sourceUrl) : null;
        if (!deal) continue;
        const key = `${deal.marketplace}:${deal.asin}`;
        if (!byKey.has(key)) byKey.set(key, deal);
      } catch (error) {
        log("deal-harvest", `short link resolve failed for ${link}`, error);
      }
    }
  }

  return {
    ok: true,
    deals: [...byKey.values()],
    errors,
    capped: capped || asinCapHit,
    ...(rendered ? { rendered } : {}),
  };
}

// Deep scan one site: open it in a real background tab, wait for it to load and
// settle (so client-side rendering runs), read the rendered DOM, then close the
// tab. Returns the outer HTML, or null if the tab could not be opened/read. The
// tab visits the site in the user's own session (unlike the credential-less
// fetch), which is why deep scan is opt-in and capped.
async function renderDealSite(url: string): Promise<string | null> {
  let tabId: number | undefined;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
  } catch (error) {
    log("deal-harvest", `render: could not open tab for ${url}`, error);
    return null;
  }
  if (typeof tabId !== "number") return null;
  try {
    await waitForTabComplete(tabId, DEAL_HARVEST_RENDER_TIMEOUT_MS);
    await sleep(DEAL_HARVEST_RENDER_SETTLE_MS);
    const [injection] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => document.documentElement.outerHTML,
    });
    return typeof injection?.result === "string" ? injection.result : null;
  } catch (error) {
    log("deal-harvest", `render failed for ${url}`, error);
    return null;
  } finally {
    void chrome.tabs.remove(tabId).catch(() => {
      // tab may already be gone (navigation removed it, or the user closed it)
    });
  }
}

// Resolve once the tab reports status "complete" (or the timeout fires). SPA
// sites fire "complete" on the initial document before hydration, so callers add
// a settle dwell after this resolves.
function waitForTabComplete(tabId: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (err?: Error): void => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const onUpdated = (id: number, info: chrome.tabs.TabChangeInfo): void => {
      if (id === tabId && info.status === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error("render timed out")), timeoutMs);
    chrome.tabs.onUpdated.addListener(onUpdated);
    // Guard the race where the tab finished loading before the listener attached.
    void chrome.tabs
      .get(tabId)
      .then((t) => {
        if (t.status === "complete") finish();
      })
      .catch(() => finish(new Error("tab gone")));
  });
}

// Follow a short link's redirect chain and return the final URL. The body is
// never read (cancelled as soon as the headers land); only res.url matters.
async function resolveRedirect(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEAL_HARVEST_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    try {
      await res.body?.cancel();
    } catch {
      // body already consumed or locked; the URL is still what we came for
    }
    return res.url || null;
  } finally {
    clearTimeout(timer);
  }
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

// Automatic background harvest (opt-in, off by default). The deals page turns
// this on from a click (so it can request host permission for the sites first);
// once on, the DEAL_AUTO_HARVEST_ALARM in background/index.ts calls runAutoHarvest
// on a fixed cadence with no page open, so newly-posted deals surface without the
// user remembering to visit the harvester.
const AUTO_HARVEST_KEY = "ib-deal-auto-harvest";

export async function getDealAutoHarvest(): Promise<boolean> {
  try {
    const out = await chrome.storage.local.get(AUTO_HARVEST_KEY);
    return out?.[AUTO_HARVEST_KEY] === true;
  } catch {
    return false;
  }
}

export async function setDealAutoHarvest(enabled: boolean): Promise<void> {
  await chrome.storage.local.set({ [AUTO_HARVEST_KEY]: enabled });
}

// Run one automatic harvest pass: curated + saved sources, deep scan on (most
// aggregators are script-rendered), enrich through the Creator API when
// configured, and queue every found deal as a normal finding (the same sync
// path RECORD_FINDING uses) so it reaches the dashboard/desktop app. This never
// auto-sends to a Deals workspace - that "pick and send" step stays a deliberate
// action on the deals page, same as a manual harvest.
export async function runAutoHarvest(): Promise<void> {
  if (!(await getDealAutoHarvest())) return;

  const [settings, curated] = await Promise.all([getSettings(), getDealSources()]);
  const candidates = [...new Set([...curated.map((s) => s.url), ...settings.dealSources])];
  // An alarm has no user gesture to request a NEW host permission, so only
  // visit sites the extension already holds permission for (granted the first
  // time the user harvested manually, or when they turned this setting on).
  const urls = await onlyGrantedOrigins(candidates);
  if (urls.length === 0) return;

  const result = await harvestDealSites(urls, { render: true });
  if (result.deals.length === 0) return;

  const enrichedByKey = await enrichByAsin(result.deals);
  const detectedAt = new Date().toISOString();
  for (const deal of result.deals) {
    const enriched = enrichedByKey.get(`${deal.marketplace}:${deal.asin}`);
    const finding: DealFinding = {
      type: "deal",
      asin: deal.asin,
      marketplace: deal.marketplace,
      title: enriched?.title ?? undefined,
      priceCents: enriched?.priceCents ?? null,
      discountPct: null,
      commissionRatePct: null,
      currency: enriched?.currency ?? undefined,
      imageUrl: enriched?.imageUrl ?? undefined,
      sourceUrl: deal.sourceUrl,
      promoCode: deal.promoCode,
      detectedAt,
    };
    await enqueue(finding as Finding);
  }
  void flush();
}

async function onlyGrantedOrigins(urls: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const url of urls) {
    try {
      const origin = `${new URL(url).origin}/*`;
      if (await chrome.permissions.contains({ origins: [origin] })) out.push(url);
    } catch {
      // malformed URL: skip
    }
  }
  return out;
}

type EnrichedProduct = EnrichResult["items"][number]["results"][number];

async function enrichByAsin(deals: HarvestedDeal[]): Promise<Map<string, EnrichedProduct>> {
  const asins = [...new Set(deals.map((d) => d.asin))];
  const marketplaces = [...new Set(deals.map((d) => d.marketplace))];
  const byKey = new Map<string, EnrichedProduct>();
  try {
    const res = await enrichProducts(asins, marketplaces);
    if (!res.ok || !res.configured) return byKey;
    for (const item of res.items) {
      for (const p of item.results) {
        if (p.found && p.asin) byKey.set(`${p.marketplace}:${p.asin}`, p);
      }
    }
  } catch (error) {
    log("deal-harvest", "auto-harvest enrich failed", error);
  }
  return byKey;
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

function shortLinkDelay(): number {
  return (
    DEAL_HARVEST_SHORTLINK_DELAY_MIN_MS +
    Math.random() * (DEAL_HARVEST_SHORTLINK_DELAY_MAX_MS - DEAL_HARVEST_SHORTLINK_DELAY_MIN_MS)
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Timed out";
  return error instanceof Error ? error.message : "Fetch failed";
}
