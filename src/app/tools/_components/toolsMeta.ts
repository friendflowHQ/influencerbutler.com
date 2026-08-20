// Single source of truth for the 5 free tools. Consumed by the /tools hub grid
// and by each tool page's "More free tools" cross-links so titles, taglines,
// and slugs stay consistent everywhere.

export type ToolMeta = {
  /** URL slug under /tools/. */
  slug: string;
  /** Short display name (used in cards and cross-links). */
  title: string;
  /** One-line pitch shown on the hub card. */
  tagline: string;
  /** Emoji glyph used as a lightweight card icon. */
  icon: string;
  /** Value tag shown to reinforce the reason to click. */
  badge: string;
};

export const TOOLS: ToolMeta[] = [
  {
    slug: "amazon-affiliate-earnings-calculator",
    title: "Amazon Affiliate Earnings Calculator",
    tagline:
      "Estimate your monthly and yearly Amazon commissions from clicks, conversion rate, and category.",
    icon: "💰",
    badge: "Plan your income",
  },
  {
    slug: "amazon-sales-estimator",
    title: "Amazon Sales Estimator",
    tagline:
      "Turn any Best Sellers Rank into an estimate of how many units a product sells each month.",
    icon: "📈",
    badge: "BSR to sales",
  },
  {
    slug: "engagement-rate-calculator",
    title: "Engagement Rate Calculator",
    tagline:
      "See your true engagement rate and how it stacks up against the benchmark for your platform.",
    icon: "❤️",
    badge: "Know your worth",
  },
  {
    slug: "hashtag-generator",
    title: "Hashtag Generator",
    tagline:
      "Generate a ready-to-paste mix of broad, niche, and shopping hashtags for any product post.",
    icon: "🏷️",
    badge: "Reach more shoppers",
  },
  {
    slug: "affiliate-link-builder",
    title: "Affiliate Link Builder",
    tagline:
      "Add clean channel tags and UTM parameters to your storefront links so you know what converts.",
    icon: "🔗",
    badge: "Track every click",
  },
];

/** Look up one tool's metadata by slug. */
export function toolBySlug(slug: string): ToolMeta | undefined {
  return TOOLS.find((t) => t.slug === slug);
}
