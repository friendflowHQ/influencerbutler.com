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

// One Subscribe & Save flat activation-bounty category, pre-resolved server
// side: `amountCents` is the real scraped rate when the harvested snapshot's
// "(a) Bounty Events" table has a matching row, else the published fallback
// ($0.25 as of 2026-10-17). `tokens` covers both vocabularies a product's own
// category text might carry -- see SNS_BOUNTY_GROUPS below -- so the
// extension's lookup is a single flat token match with no fallback logic of
// its own to keep in sync with this file.
export type SnsBountyRow = { tokens: string[]; amountCents: number };

export type RateCard = {
  marketplace: string;
  version: string;
  source: string | null;
  checkedAt: number | null;
  // The "All Other Categories" catch-all rate: what Amazon pays for any leaf
  // category not spelled out in the table (most products).
  defaultRatePct: number | null;
  rows: RateCardRow[];
  snsBounty: SnsBountyRow[];
};

const TABLE_TITLE_RE = /fixed (standard )?commission/i;
const CATCH_ALL_RE = /^(all\s+other|all\s+others?|other\s+categor)/i;
const SPLIT_RE = /[,;]|\band\b/i;
const RATE_RE = /([\d.]+)\s*%/;

// Mirrors integrations/amazon/rate-card.js's SNS_BOUNTY_* constants in the
// desktop repo (same six Amazon Subscribe & Save bounty categories, same
// published fallback rate) -- see that file's own doc comment for how this
// was verified live. Kept as a second, independent copy here rather than a
// shared package: the desktop app scrapes and owns the source data, this
// repo only re-serves an already-scraped snapshot to the extension.
const SNS_BOUNTY_TABLE_TITLE_RE = /bounty events/i;
const SNS_PROGRAM_RE = /subscribe\s*&?\s*save|subscribe\s+and\s+save/i;
const SNS_FALLBACK_CENTS = 25; // $0.25

// Each bounty category's PROGRAM name (from Amazon's own Bounty Events table)
// and standard Associates DEPARTMENT name(s) -- a product's own breadcrumb
// carries one or the other, rarely both, and the two vocabularies rarely
// share a literal substring ("Beauty & Grooming" vs "Beauty & Personal
// Care"). No bare "beauty"/"baby"/"health" entries, so a lookup never sweeps
// in an adjacent, ineligible category (e.g. "Luxury Stores Beauty" must not
// match).
const SNS_BOUNTY_GROUPS: string[][] = [
  ["beauty & grooming", "professional beauty", "beauty & personal care"],
  ["grocery", "grocery & gourmet food"],
  ["health & household", "health & personal care", "hpc"],
  ["pet food & supplies", "pet supplies", "pet products"],
  ["diapers", "baby & nursery", "baby products", "diapering"],
];

function parseDollarsToCents(cell: unknown): number | null {
  const match = String(cell ?? "").match(/([\d.]+)/);
  if (!match || !match[1]) return null;
  const value = parseFloat(match[1]);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
}

// Pulls the category portion out of a Bounty Events row's program name.
// Mirrors extractSnsCategoryFromProgram in the desktop repo: most rows read
// "Subscribe & Save <dash> <Category>"; one ("Professional Beauty Subscribe &
// Save Activation and Delivery") leads with the category instead.
function extractSnsProgramCategory(programName: string): string {
  const raw = programName.trim();
  if (!raw || !SNS_PROGRAM_RE.test(raw)) return "";
  const dashMatch = raw.match(/subscribe\s*&?\s*save\s*[-–—]\s*(.+)$/i);
  if (dashMatch?.[1]?.trim()) return dashMatch[1].trim();
  const leadMatch = raw.match(/^(.*?)\s+subscribe\s*&?\s*save\b/i);
  if (leadMatch?.[1]?.trim()) return leadMatch[1].trim();
  return "";
}

// Builds one row per bounty group: the live scraped amount when the
// snapshot's Bounty Events table has a program matching this group's
// vocabulary, else the published fallback. `entry` is the already-resolved
// per-marketplace snapshot entry parseRateCard already looked up.
function parseSnsBounty(entry: RawEntry): SnsBountyRow[] {
  const table = (entry.tables ?? []).find(
    (t) => typeof t?.title === "string" && SNS_BOUNTY_TABLE_TITLE_RE.test(t.title),
  );
  const scraped: { category: string; amountCents: number }[] = [];
  for (const row of table?.rows ?? []) {
    if (!Array.isArray(row) || !row.length) continue;
    const category = extractSnsProgramCategory(String(row[0] ?? ""));
    if (!category) continue;
    const amountCents = parseDollarsToCents(row[row.length - 1]);
    if (amountCents === null) continue;
    scraped.push({ category: category.toLowerCase(), amountCents });
  }

  return SNS_BOUNTY_GROUPS.map((tokens) => {
    const match = scraped.find((s) => tokens.some((tok) => s.category.includes(tok) || tok.includes(s.category)));
    return { tokens, amountCents: match ? match.amountCents : SNS_FALLBACK_CENTS };
  });
}

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
    snsBounty: parseSnsBounty(entry),
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
