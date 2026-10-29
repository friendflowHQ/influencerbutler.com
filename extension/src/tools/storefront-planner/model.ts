import type { CcRate, SpccRate } from "../../shared/messages";

// Pure helpers for the Campaign and Deal Planner: which of the products a creator
// already features (tagged in their storefront videos) sit in a campaign or on a
// deal, ranked so the best place to send traffic comes first. DOM-free so it is
// unit-testable.

export type PlannerRow = {
  asin: string;
  cc: CcRate | null;
  spcc: SpccRate | null;
  deal: boolean;
  // How many storefront videos tag the product.
  videos: number;
};

export type PlannerInput = {
  // Tagged ASINs per storefront video (one entry per video).
  videoAsins: ReadonlyArray<readonly string[]>;
  ccFlagged: ReadonlySet<string>;
  spccFlagged: ReadonlySet<string>;
  dealFlagged: ReadonlySet<string>;
  ccRates: Readonly<Record<string, CcRate>>;
  spccRates: Readonly<Record<string, SpccRate>>;
};

export type PlannerResult = { rows: PlannerRow[]; scanned: number };

// Rank: campaign + deal first, then campaign, then deal only; within a tier the
// highest Creator Connections rate, then SPCC $/click, then the product that
// appears in the most videos.
function tier(row: PlannerRow): number {
  return (row.cc || row.spcc ? 2 : 0) + (row.deal ? 1 : 0);
}

export function buildPlan(input: PlannerInput): PlannerResult {
  const counts = new Map<string, number>();
  for (const asins of input.videoAsins) {
    for (const asin of new Set(asins.map((a) => a.toUpperCase()))) {
      counts.set(asin, (counts.get(asin) ?? 0) + 1);
    }
  }
  const rows: PlannerRow[] = [];
  for (const [asin, videos] of counts) {
    const inCc = input.ccFlagged.has(asin);
    const inSpcc = input.spccFlagged.has(asin);
    const deal = input.dealFlagged.has(asin);
    if (!inCc && !inSpcc && !deal) continue;
    rows.push({
      asin,
      cc: inCc ? (input.ccRates[asin] ?? null) : null,
      spcc: inSpcc ? (input.spccRates[asin] ?? null) : null,
      deal,
      videos,
    });
  }
  rows.sort(
    (a, b) =>
      tier(b) - tier(a) ||
      (b.cc?.ratePct ?? 0) - (a.cc?.ratePct ?? 0) ||
      (b.spcc?.epc ?? 0) - (a.spcc?.epc ?? 0) ||
      b.videos - a.videos ||
      a.asin.localeCompare(b.asin),
  );
  return { rows, scanned: counts.size };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function plannerCsv(rows: readonly PlannerRow[], marketplace: string): string {
  const header = ["asin", "url", "cc_rate_pct", "cc_ends", "spcc_epc", "deal", "videos"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.asin,
        `https://${marketplace}/dp/${r.asin}`,
        r.cc ? r.cc.ratePct : "",
        r.cc?.endsAt ?? "",
        r.spcc ? r.spcc.epc : "",
        r.deal ? "yes" : "",
        r.videos,
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
