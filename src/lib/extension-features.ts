// Canonical feature list for the free Chrome extension. Every public surface
// that names or counts the extension's tools (the /extension landing page, the
// homepage extension section, the Help & Tutorials article in all three
// locales, and the Chrome Web Store listing draft in docs/) should read from
// or be checked against this file, so the tool count can never drift.
//
// Every entry below maps to a real directory under extension/src/tools/ (noted
// per tool). Names follow what the extension's own i18n catalog calls the
// surface (extension/src/i18n/catalog.ts). Do not list a tool here that is not
// shipping in the extension source.

export type ExtensionGroupId =
  | "research"
  | "creator-connections"
  | "never-throttled"
  | "fast"
  | "deep-links"
  | "global-maximizer"
  | "storefront";

export type ExtensionGroup = {
  id: ExtensionGroupId;
  name: string;
  // One-line promise for the group, used as a card subtitle.
  tagline: string;
  // A group can be a section without any tool rows (Never throttled, Fast):
  // it explains a property of the whole extension rather than a surface.
  kind: "tools" | "section";
};

// Ordered: this is the order the landing page, homepage cards, and tutorial
// sections present the groups in.
export const EXTENSION_GROUPS: readonly ExtensionGroup[] = [
  {
    id: "research",
    name: "Product research",
    tagline: "The whole picture on every product page",
    kind: "tools",
  },
  {
    id: "creator-connections",
    name: "Creator Connections",
    tagline: "Score, brief, and accept campaigns without leaving the grid",
    kind: "tools",
  },
  {
    id: "never-throttled",
    name: "Never throttled",
    tagline: "One polite request at a time, so Amazon never blocks you",
    kind: "section",
  },
  {
    id: "fast",
    name: "Fast",
    tagline: "Reads the page you are already on, so results are instant",
    kind: "section",
  },
  {
    id: "deep-links",
    name: "Deep links",
    tagline: "Your affiliate link, one tap, opens the Amazon app",
    kind: "tools",
  },
  {
    id: "global-maximizer",
    name: "Global Maximizer",
    tagline: "Localized links for 12 marketplaces",
    kind: "tools",
  },
  {
    id: "storefront",
    name: "Storefront Checkup",
    tagline: "Stop leaking commissions on your own shop",
    kind: "tools",
  },
] as const;

export type ExtensionTool = {
  id: string;
  name: string;
  group: ExtensionGroupId;
  tagline: string;
  description: string;
  // Set when the tool is a bonus surface listed under "Also in the box" rather
  // than a headline card in its group.
  alsoInTheBox?: boolean;
};

export const EXTENSION_TOOLS: readonly ExtensionTool[] = [
  // Product research (extension/src/tools/score, butler-approved,
  // price-history, video-counts, trend-radar, orders-butler).
  {
    id: "butler-score",
    name: "Butler Score + Butler Approved seal",
    group: "research",
    tagline: "A 0 to 100 number and a green light you can trust",
    description:
      "Every product page gets a Butler Score with a hover breakdown of where the points came from, next to the Butler Approved seal: actively selling, an open influencer slot in the carousel, in stock, and above your price floor. Each criterion shows pass or fail so you know why.",
  },
  {
    id: "bsr-revenue",
    name: "BSR + estimated revenue with price and rank history",
    group: "research",
    tagline: "Sales rank, estimated monthly units, and a sparkline",
    description:
      "Reads the Best Sellers Rank on the page, turns it into estimated monthly units and revenue, and draws a price-history sparkline (plus sales-rank history when the desktop app is paired), so you can see whether a product is climbing or fading.",
  },
  {
    id: "video-scanner",
    name: "Video Scanner",
    group: "research",
    tagline: "Know the carousel before you film",
    description:
      "Counts the videos on any product and who made them: influencer, brand, or customer, with an open-slot indicator for the upper carousel. The exact competition picture other tools charge monthly for, free while you browse.",
  },
  {
    id: "trend-radar",
    name: "Trend Radar",
    group: "research",
    tagline: "Money signals on Best Sellers, New Releases, and Movers & Shakers",
    description:
      "Badges every tile on Amazon's discovery grids with its Butler Score, estimated $ per sale, and video count, with a toolbar to sort and filter by what pays, so the best opportunities on a page jump out.",
  },
  {
    id: "content-gaps",
    name: "Content Gap Finder + Orders Butler",
    group: "research",
    tagline: "Film what you already own",
    description:
      "One click on your order history flags the products you bought that have few or zero influencer videos, and Orders Butler syncs your whole purchase history to your dashboard, the same pull the desktop runner does.",
  },

  // Creator Connections (extension/src/tools/campaign-radar, message-templates,
  // campaigns + hud-actions).
  {
    id: "campaign-radar",
    name: "Campaign Radar",
    group: "creator-connections",
    tagline: "Score chips, fill meters, and Last Call watch bells",
    description:
      "Every card on the Creator Connections grid gets an opportunity score, chips for products you already own or have earned on, a fill meter showing how full the campaign is, and a watch bell that alerts you before a nearly full campaign closes.",
  },
  {
    id: "campaign-butler",
    name: "Campaign Butler brief + message templates",
    group: "creator-connections",
    tagline: "The Butler's Brief, then your best message",
    description:
      "Open a campaign and get The Butler's Brief: a verdict, why to take it, what to film, and which product to lead with. Then drop a saved message template into the Creator Connections composer with placeholders filled in.",
  },
  {
    id: "one-tap-accept",
    name: "One-tap accept via the paired desktop app",
    group: "creator-connections",
    tagline: "See it in the browser, accept it from the panel",
    description:
      "When the desktop app is paired, the product panel shows Accept buttons for available Creator Connections and Sponsored Products campaigns and hands the click to the app, which confirms enrollment.",
  },

  // Deep links (extension/src/tools/my-link, quick-links, and the Link Butler
  // ledger over links.influencerbutler.com).
  {
    id: "my-link",
    name: "My Link / Get link",
    group: "deep-links",
    tagline: "Your affiliate link on every product, free",
    description:
      "Get link sits pinned at the top of the panel: one tap builds your own tagged Amazon link for the product on screen, and it opens the Amazon app on a phone so viewers land in the app, not a browser tab.",
  },
  {
    id: "link-butler",
    name: "Branded short links with the Link Butler click ledger",
    group: "deep-links",
    tagline: "A short link you own, with clicks by day and country",
    description:
      "Sign in with your Influencer Butler license key and mint branded short links, then watch clicks by day, country, device, and surface in the Link Butler ledger. If a product goes unavailable, repoint the same link so old posts keep earning.",
  },

  // Global Maximizer (extension/src/tools/global-maximizer).
  {
    id: "global-maximizer",
    name: "Global Maximizer",
    group: "global-maximizer",
    tagline: "Localized links for 12 marketplaces",
    description:
      "For the product on screen, one row per marketplace (US, CA, UK, AU, DE, FR, IT, ES, JP, IN, MX, BR) with availability, local price, and an estimated commission per sale, plus a localized affiliate link for each and a copy-all for the whole set.",
  },

  // Storefront Checkup (extension/src/tools/storefront-check), with the bonus
  // harvest surfaces (deal-harvester, idea-list) listed under it.
  {
    id: "storefront-checkup",
    name: "Storefront Checkup",
    group: "storefront",
    tagline: "Stop leaking commissions",
    description:
      "One click checks your storefront videos for missing product tags, over-tagging that dilutes clicks, and tagged products that have gone unavailable, and exports the results as a CSV.",
  },
] as const;

// Bonus surfaces mentioned under "Also in the box". They are real tools
// (extension/src/tools/deal-harvester, extension/src/tools/idea-list) but are
// not counted in the headline number, so the count stays about research and
// Creator Connections rather than everything that ships.
export const EXTENSION_ALSO_IN_THE_BOX: readonly { name: string; description: string }[] = [
  {
    name: "Deal Sites Harvester",
    description: "Collect the deals from a deal roundup page you visit into one table, each with your own affiliate link.",
  },
  {
    name: "Idea List capture",
    description: "Queue any product you are browsing into an Amazon Idea List, with money signals badged on every Idea List page.",
  },
];

// Derived, never hand-typed: the number every public surface quotes.
export const EXTENSION_TOOL_COUNT: number = EXTENSION_TOOLS.length;

// Measured load-time budget for the on-page panel, in milliseconds. Copy about
// speed ("results in under N ms") renders only when this is set to a real
// measured number; until then the Fast section describes the mechanism (it
// reads the page you are already on) and makes no timing claim.
export const PERF_BUDGET_MS: number | null = null;

export function toolsInGroup(group: ExtensionGroupId): ExtensionTool[] {
  return EXTENSION_TOOLS.filter((tool) => tool.group === group);
}
