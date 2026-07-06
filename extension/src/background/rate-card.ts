import { RATE_CARD_BASE, RATE_CARD_STALE_MS } from "../shared/constants";
import { getRateCard, setRateCard, type RateCardRow } from "../rate-card/cache";
import { log } from "../shared/log";

// Refreshes the Associates rate card from the site, at most daily. Sends
// If-None-Match with the cached version so an unchanged card costs a 304 and no
// re-download. Runs from the background worker (content scripts read the cache).
// No-ops cleanly while the rate card has not been published yet (notBuilt).

export async function refreshRateCard(): Promise<void> {
  const existing = await getRateCard();
  if (existing && Date.now() - existing.fetchedAt < RATE_CARD_STALE_MS) return;

  try {
    const headers: Record<string, string> = {};
    if (existing) headers["If-None-Match"] = `"rate-${existing.marketplace}-${existing.version}"`;

    const res = await fetch(RATE_CARD_BASE, { headers });
    if (res.status === 304) {
      if (existing) await setRateCard({ ...existing, fetchedAt: Date.now() });
      return;
    }
    if (!res.ok) return;

    const data = (await res.json()) as {
      marketplace?: string;
      version?: string;
      defaultRatePct?: number | null;
      rows?: RateCardRow[];
      notBuilt?: boolean;
      migrationPending?: boolean;
    };
    if (data.notBuilt || data.migrationPending || !data.version || !Array.isArray(data.rows)) return;

    await setRateCard({
      marketplace: data.marketplace ?? "amazon.com",
      version: data.version,
      defaultRatePct: data.defaultRatePct ?? null,
      rows: data.rows,
      fetchedAt: Date.now(),
    });
    log("rate-card", `refreshed -> ${data.version}`);
  } catch (error) {
    log("rate-card", "refresh failed", error);
  }
}
