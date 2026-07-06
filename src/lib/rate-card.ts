/**
 * Reads the Amazon Associates fixed commission-rate schedule ("rate card")
 * from the influencerbutler R2 bucket and normalizes it into a compact
 * category -> rate table the extension can look a product up against.
 *
 * The rate card is login-gated on Amazon's side, so it cannot be scraped
 * server-side. It is harvested by the desktop app (workspaces/settings/
 * rate_card_checker.js) and published to the central feed as
 *   dcb/rate-cards/latest.json
 * exactly like the CC / SPCC catalogues. This reader soft-fails (returns null)
 * until that object exists, so the serve route and extension no-op cleanly in
 * the meantime. See docs/extension-rate-card.md for the publish step.
 */
import { r2ReadJson } from "./r2-catalogue";

const KEY = "dcb/rate-cards/latest.json";

// The published shape: the desktop rate-card snapshot (per marketplace) with a
// top-level version + harvest time. Each entry carries the scraped commission
// tables (title / headers / rows) as-is.
type RawTable = { title?: string; headers?: string[]; rows?: string[][] };
type RawEntry = {
  marketplace?: string;
  sourceUrl?: string;
  lastCheckedAt?: number;
  tables?: RawTable[];
};
export type RawSnapshot = {
  version?: string;
  harvestedAt?: string;
  byMarketplace?: Record<string, RawEntry>;
};

export type RateCardRow = { label: string; tokens: string[]; ratePct: number };

export type RateCard = {
  marketplace: string;
  version: string;
  source: string | null;
  checkedAt: number | null;
  // The "All Other Categories" catch-all rate: what Amazon pays for any leaf
  // category not spelled out in the table (most products).
  defaultRatePct: number | null;
  rows: RateCardRow[];
};

const TABLE_TITLE_RE = /fixed (standard )?commission/i;
const CATCH_ALL_RE = /^(all\s+other|all\s+others?|other\s+categor)/i;
const SPLIT_RE = /[,;]|\band\b/i;
const RATE_RE = /([\d.]+)\s*%/;

function normalizeMarket(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "") || "amazon.com";
}

export async function readRateCard(marketplace = "amazon.com"): Promise<RateCard | null> {
  const snap = await r2ReadJson<RawSnapshot>(KEY);
  return parseRateCard(snap, marketplace);
}

// Pure normalization of a published snapshot into the served RateCard. Exposed
// for tests; readRateCard just wraps it around the R2 fetch.
export function parseRateCard(
  snap: RawSnapshot | null,
  marketplace = "amazon.com",
): RateCard | null {
  if (!snap || !snap.byMarketplace) return null;

  const market = normalizeMarket(marketplace);
  const entry = snap.byMarketplace[market] ?? snap.byMarketplace["amazon.com"];
  if (!entry) return null;

  const table = (entry.tables ?? []).find(
    (t) => typeof t?.title === "string" && TABLE_TITLE_RE.test(t.title),
  );

  const rows: RateCardRow[] = [];
  let defaultRatePct: number | null = null;
  for (const row of table?.rows ?? []) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const label = String(row[0] ?? "").trim();
    const ratePct = parseRate(row[row.length - 1]);
    if (!label || ratePct === null) continue;
    if (CATCH_ALL_RE.test(label)) {
      defaultRatePct = ratePct;
      continue;
    }
    rows.push({ label, tokens: tokenize(label), ratePct });
  }

  return {
    marketplace: market,
    version: snap.version || String(entry.lastCheckedAt ?? "unknown"),
    source: entry.sourceUrl || null,
    checkedAt: entry.lastCheckedAt ?? null,
    defaultRatePct,
    rows,
  };
}

function parseRate(cell: unknown): number | null {
  const match = String(cell ?? "").match(RATE_RE);
  if (!match || !match[1]) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function tokenize(label: string): string[] {
  return label
    .split(SPLIT_RE)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
