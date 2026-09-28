// associate-rates.ts - a small, client-safe snapshot of the standard US Amazon
// Associates category commission rates.
//
// Why this exists instead of reusing src/lib/rate-card.ts: rate-card.ts reads
// the live rate feed from R2 (async, server-only) and can be empty in some
// environments, so it is unsafe to import into a public browser widget. The
// public Amazon Associates fee schedule changes rarely, so a static snapshot is
// the reliable source for the free Earnings Calculator's category dropdown.
//
// These are the standard US rates; Amazon can update them and some programs
// (e.g. Bounties) differ. The tool copy makes clear these are estimates.

export type AssociateRate = {
  /** Human label shown in the dropdown. */
  label: string;
  /** Commission rate as a percentage (e.g. 3 means 3%). */
  ratePct: number;
};

// Ordered roughly high-to-low so the most lucrative categories surface first.
export const ASSOCIATE_RATES: AssociateRate[] = [
  { label: "Amazon Games", ratePct: 20 },
  { label: "Luxury Beauty & Luxury Stores", ratePct: 10 },
  { label: "Digital Music & Videos", ratePct: 5 },
  { label: "Physical Books", ratePct: 4.5 },
  { label: "Kitchen & Housewares", ratePct: 4.5 },
  { label: "Automotive", ratePct: 4.5 },
  { label: "Apparel & Fashion", ratePct: 4 },
  { label: "Jewelry", ratePct: 4 },
  { label: "Shoes, Handbags & Accessories", ratePct: 4 },
  { label: "Luggage", ratePct: 4 },
  { label: "Watches", ratePct: 4 },
  { label: "Toys & Games (physical)", ratePct: 3 },
  { label: "Furniture", ratePct: 3 },
  { label: "Home & Home Improvement", ratePct: 3 },
  { label: "Lawn & Garden", ratePct: 3 },
  { label: "Pet Products", ratePct: 3 },
  { label: "Beauty", ratePct: 3 },
  { label: "Headphones", ratePct: 3 },
  { label: "Musical Instruments", ratePct: 3 },
  { label: "Outdoors & Tools", ratePct: 3 },
  { label: "Sports", ratePct: 3 },
  { label: "PCs & PC Components", ratePct: 2.5 },
  { label: "Televisions & Digital Video Games", ratePct: 2 },
  { label: "Grocery & Health / Personal Care", ratePct: 1 },
  { label: "Physical Video Games & Consoles", ratePct: 1 },
];

/** The category the calculator selects by default (a common mid-range rate). */
export const DEFAULT_ASSOCIATE_RATE_LABEL = "Home & Home Improvement";
