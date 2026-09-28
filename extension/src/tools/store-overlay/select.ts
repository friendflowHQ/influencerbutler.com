import type { ScoreBand } from "../score/model";

// Which store tiles earn the green box: every strong candidate, meaning the
// Butler Score sits in the hot band AND the product page has an upper video
// carousel (the slot a shoppable review video can land in) AND it is not out
// of stock. A product without that slot keeps its score and gets a warning
// chip instead; it never qualifies. No cap: a page can highlight zero or
// many. Pure so the rule is unit-testable.

export type GreenBoxInput = {
  asin: string;
  score: number;
  band: ScoreBand;
  // Null until Tier-1 enrichment lands for this tile.
  upperCarousel: boolean | null;
  inStock: boolean | null;
};

export function pickGreenBox(rows: GreenBoxInput[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.band !== "hot") continue;
    if (row.upperCarousel !== true) continue;
    if (row.inStock === false) continue;
    out.add(row.asin);
  }
  return out;
}
