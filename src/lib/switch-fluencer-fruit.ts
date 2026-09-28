// Fluencer Fruit -> Influencer Butler switch guide: the "what maps to what"
// rows for /switch/fluencer-fruit, plus the offer constants the landing page,
// the CTA, the email capture, and the drip sequence all share.
//
// Fluencer Fruit retires at the end of September 2026. Their column is kept
// deliberately generic (product research, campaign finder, video counts,
// earnings, mobile) because we only describe what we are sure of; we never
// invent a competitor feature. Our column names real surfaces: extension tools
// reference ids in src/lib/extension-features.ts (checked by the test), and
// desktop / web surfaces are named the way the app and dashboard name them.

import { EXTENSION_TOOLS, type ExtensionGroupId } from "@/lib/extension-features";

/** Lemon Squeezy code for the switch offer (six weeks of Pro free, Solo monthly). */
export const SWITCH_OFFER_CODE = "FRUITSWITCH";
/** Length of the offer in weeks. Copy says "your first six weeks of Pro free". */
export const SWITCH_OFFER_WEEKS = 6;
/** Contact tag applied by the email capture; the drip sequence triggers on it. */
export const SWITCH_TAG = "fluencer-fruit-switch";
/** email_subscribers.source for addresses captured on the switch page. */
export const SWITCH_SOURCE = "fluencer-fruit-switch";
/** Landing page path (used in emails and cross-links). */
export const SWITCH_PATH = "/switch/fluencer-fruit";
/** Month the competitor closes, in the form the copy uses. */
export const FLUENCER_FRUIT_CLOSES = "the end of September 2026";

export type SwitchSurface = "extension" | "desktop" | "web" | "coming";

export type SwitchRow = {
  /** Stable id for React keys and tests. */
  id: string;
  /** The Fluencer Fruit feature, in generic terms. */
  theirs: string;
  /** The Influencer Butler surface(s) that cover the same job. */
  ours: string;
  /** Which product the surface lives in. */
  surface: SwitchSurface;
  /** Plan needed: what the visitor pays for the mapped surface. */
  plan: "Free" | "Pro" | "All plans" | "Coming";
  /** Where to find it, in one line. */
  where: string;
  /** Ids from EXTENSION_TOOLS this row leans on (must exist; checked by the test). */
  extensionToolIds: readonly string[];
  /** Group ids from EXTENSION_GROUPS this row leans on (must exist; checked by the test). */
  extensionGroupIds: readonly ExtensionGroupId[];
};

export const SWITCH_ROWS: readonly SwitchRow[] = [
  {
    id: "product-research",
    theirs: "Product research",
    ours: "Butler Score + Butler Approved seal, BSR + estimated revenue with price history, and the search overlay",
    surface: "extension",
    plan: "Free",
    where: "Any Amazon product page or search results page, in the free Chrome extension panel",
    extensionToolIds: ["butler-score", "bsr-revenue", "trend-radar"],
    extensionGroupIds: ["research"],
  },
  {
    id: "campaign-finder",
    theirs: "Campaign finder",
    ours: "Campaign Radar with fill meters and Last Call watch bells, plus the Butler's Brief on every campaign",
    surface: "extension",
    plan: "Free",
    where: "The Creator Connections grid, in the free Chrome extension",
    extensionToolIds: ["campaign-radar", "campaign-butler"],
    extensionGroupIds: ["creator-connections"],
  },
  {
    id: "video-counts",
    theirs: "Video counts",
    ours: "Video Scanner: influencer, brand, and customer video counts with an open-slot indicator",
    surface: "extension",
    plan: "Free",
    where: "Any Amazon product page, in the free Chrome extension panel",
    extensionToolIds: ["video-scanner"],
    extensionGroupIds: ["research"],
  },
  {
    id: "keyword-tools",
    theirs: "Keyword tools",
    ours: "Brand keyword chips on Creator Connections messages (extension), and the AI Keyword Generator (desktop)",
    surface: "desktop",
    plan: "Pro",
    where: "Keyword chips in the Creator Connections composer; AI Keyword Generator in the desktop app",
    extensionToolIds: ["campaign-butler"],
    extensionGroupIds: ["creator-connections"],
  },
  {
    id: "earnings",
    theirs: "Earnings",
    ours: "Earnings Intelligence in the desktop app, plus the web earnings page fed by it",
    surface: "web",
    plan: "All plans",
    where: "Desktop app: Earnings Intelligence (Pro). Web: /dashboard/earnings on every plan, fed by the desktop app",
    extensionToolIds: [],
    extensionGroupIds: [],
  },
  {
    id: "mobile",
    theirs: "Mobile",
    ours: "Coming: Mobile Butler",
    surface: "coming",
    plan: "Coming",
    where: "Not shipped yet. Get link in the extension already opens the Amazon app on a phone",
    extensionToolIds: ["my-link"],
    extensionGroupIds: ["deep-links"],
  },
  {
    id: "deep-links",
    theirs: "Deep links",
    ours: "Get link (opens the Amazon app) and branded short links with the Link Butler click ledger",
    surface: "extension",
    plan: "Free",
    where: "Pinned at the top of the free Chrome extension panel on every product page",
    extensionToolIds: ["my-link", "link-butler"],
    extensionGroupIds: ["deep-links"],
  },
  {
    id: "cross-posting",
    theirs: "Cross-posting",
    ours: "Video Reload Butler (13 marketplaces, translated titles and captions) and YouTube Butler",
    surface: "desktop",
    plan: "Pro",
    where: "Desktop app, under the Reload butlers",
    extensionToolIds: [],
    extensionGroupIds: [],
  },
] as const;

export const SURFACE_LABEL: Record<SwitchSurface, string> = {
  extension: "Chrome extension",
  desktop: "Desktop app",
  web: "Desktop app + web dashboard",
  coming: "Coming",
};

/** Convenience for tests and copy: the extension tool names a row cites. */
export function extensionToolNamesFor(row: SwitchRow): string[] {
  return row.extensionToolIds
    .map((id) => EXTENSION_TOOLS.find((tool) => tool.id === id)?.name)
    .filter((name): name is string => typeof name === "string");
}
