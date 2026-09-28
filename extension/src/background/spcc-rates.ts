import { ENDPOINTS } from "../shared/constants";
import type { SpccRate, SpccRatesResult } from "../shared/messages";

// Amazon's own SPCC ("Earn on Clicks") forecast, looked up per ASIN against the
// server's daily catalogue build. Mirrors cc-rates.ts: the overlays only ask
// for ASINs whose Bloom membership already says "in an SPCC campaign", so
// batches are small, and results (including misses) are cached a day.

const KEY = "ib-spcc-rates";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 600;
// The server caps the batch size; chunk to stay under it.
const BATCH = 50;

// rate === null records a checked ASIN with no SPCC row.
type Entry = { rate: SpccRate | null; ts: number };
type Cache = Record<string, Entry>;

async function readCache(): Promise<Cache> {
  const raw = await chrome.storage.local.get(KEY);
  return (raw[KEY] as Cache) ?? {};
}

async function writeCache(cache: Cache): Promise<void> {
  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    const oldest = keys
      .sort((a, b) => (cache[a]?.ts ?? 0) - (cache[b]?.ts ?? 0))
      .slice(0, keys.length - MAX_ENTRIES);
    for (const k of oldest) delete cache[k];
  }
  await chrome.storage.local.set({ [KEY]: cache });
}

export async function lookupSpccRates(asins: string[]): Promise<SpccRatesResult> {
  const wanted = Array.from(new Set(asins.map((a) => a.trim().toUpperCase()))).filter((a) =>
    /^[A-Z0-9]{10}$/.test(a),
  );
  if (wanted.length === 0) return { ok: true, rates: {} };

  const cache = await readCache();
  const now = Date.now();
  const rates: Record<string, SpccRate> = {};
  const misses: string[] = [];
  for (const asin of wanted) {
    const hit = cache[asin];
    if (hit && now - hit.ts < TTL_MS) {
      if (hit.rate) rates[asin] = hit.rate;
    } else {
      misses.push(asin);
    }
  }
  if (misses.length === 0) return { ok: true, rates };

  let fetchedAny = false;
  try {
    for (let i = 0; i < misses.length; i += BATCH) {
      const batch = misses.slice(i, i + BATCH);
      const res = await fetch(ENDPOINTS.spccRates, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asins: batch }),
      });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => null)) as {
        rates?: Record<string, SpccRate>;
      } | null;
      if (!data || typeof data.rates !== "object" || data.rates === null) continue;
      fetchedAny = true;
      for (const asin of batch) {
        const raw = data.rates[asin] ?? null;
        const rate: SpccRate | null = raw
          ? {
              epc: raw.epc,
              budgetAvailability: raw.budgetAvailability ?? null,
              brand: raw.brand ?? null,
            }
          : null;
        cache[asin] = { rate, ts: now };
        if (rate) rates[asin] = rate;
      }
    }
  } catch {
    // Network failure: serve whatever the cache had; the chip stays plain.
    return { ok: false, rates };
  }
  if (fetchedAny) await writeCache(cache);
  return { ok: true, rates };
}
