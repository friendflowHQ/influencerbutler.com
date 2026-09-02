// Single source of truth for the "Grow Together Creator Bundle": key dates and
// the chapter topic list. Consumed by the recruitment landing page, the
// contributor application form (to show which topics still have room), the
// /api/grow-together/topics availability endpoint, and the admin tracker.
//
// This is a collaborative creator bundle: a group of Amazon / Walmart / social
// creators each write one chapter, then everyone promotes the finished PDF to
// their own audience during launch week. The captured email list is shared back
// with the contributors (see the co-registration disclosure on the reader page),
// which is the incentive that makes cross-promotion worth their while.
//
// No server-only imports here: this file is imported by both server routes and
// client components. Dates are plain ISO strings; format with the helpers below.

export const BUNDLE_SLUG = "grow-together";
export const BUNDLE_NAME = "Grow Together Creator Bundle";

/**
 * Key dates for the ~6-week run (kickoff early September 2026). Change these in
 * one place and every surface (landing copy, deadline reminders, admin) follows.
 * All are calendar dates interpreted loosely (no time zone): they drive display
 * copy and the deadline reminders, not precise scheduling.
 */
export const BUNDLE_DATES = {
  /** When contributor recruiting opened. */
  recruitOpen: "2026-09-02",
  /** Last day to claim a topic and commit. */
  recruitClose: "2026-09-19",
  /** Chapters due (drafts in). Reinforced by the coordination emails. */
  submissionDeadline: "2026-10-03",
  /** First day of the coordinated cross-promotion push. */
  launchDate: "2026-10-13",
  /** Last day of launch week. */
  launchWeekEnd: "2026-10-17",
} as const;

/**
 * Total contributors accepted for this edition. The apply route rejects once the
 * roster (non-declined rows) reaches this, on top of the per-topic caps. Matches
 * the ~25 of the original Live Sweet bundle. Config: change it here.
 */
export const MAX_CONTRIBUTORS = 25;

/**
 * The concluding prompt each contributor answers to close their chapter (from the
 * original bundle's contributor brief). The submission form lets them pick one.
 */
export const CONCLUDING_QUESTIONS = [
  "What is one thing you wish you had known when you were starting out?",
  "What is the biggest challenge you face when it comes to online growth?",
  "One tip you would give to anyone wanting to grow their online presence.",
] as const;

/** The tag applied to a contributor on signup (fires the onboarding sequence). */
export const CONTRIBUTOR_TAG = "bundle-contributor";
/** email_subscribers.source recorded when someone applies to contribute. */
export const CONTRIBUTOR_SOURCE = "grow-together-contributor";
/** email_subscribers.source recorded when a reader downloads the finished PDF. */
export const READER_SOURCE = "grow-together-bundle";

/** Path the finished bundle PDF is served from once chapters are assembled. */
export const BUNDLE_PDF_PATH = "/guides/grow-together-creator-bundle.pdf";

export type BundleTopic = {
  /** Stable slug (used in the DB `topic` column and availability endpoint). */
  slug: string;
  /** Section title shown on the landing page and in the form dropdown. */
  title: string;
  /** One-line description of what a chapter on this topic would cover. */
  blurb: string;
  /**
   * How many contributors may claim this topic. Kept small so chapters stay
   * distinct; the apply endpoint enforces it by counting existing rows.
   */
  capacity: number;
};

/** Default slots per topic when a topic does not override `capacity`. */
const DEFAULT_CAPACITY = 2;

const RAW_TOPICS: Array<Omit<BundleTopic, "capacity"> & { capacity?: number }> = [
  {
    slug: "amazon-storefront-setup",
    title: "Setting up an Amazon storefront that sells",
    blurb: "Idea lists, shoppable photos, and a storefront layout that turns browsers into buyers.",
  },
  {
    slug: "creator-connections-campaigns",
    title: "Winning Amazon Creator Connections campaigns",
    blurb: "Finding the right campaigns, getting accepted, and picking products that actually convert.",
  },
  {
    slug: "first-commissions",
    title: "Getting your first Amazon commissions",
    blurb: "The exact first steps for a brand-new affiliate, from approval to that first sale.",
  },
  {
    slug: "short-form-video",
    title: "Short-form video that sells",
    blurb: "Hooks, formats, and calls to action that move product on Reels, TikTok, and Shorts.",
  },
  {
    slug: "product-photography",
    title: "Product photography for storefronts",
    blurb: "Lighting, styling, and phone-only tricks for photos that make people want to buy.",
  },
  {
    slug: "growing-engaged-following",
    title: "Growing an engaged following",
    blurb: "Turning passive followers into a community that trusts your recommendations.",
  },
  {
    slug: "pinterest-affiliate-traffic",
    title: "Pinterest for affiliate traffic",
    blurb: "Using Pinterest as a long-tail engine that sends shoppers to your links for months.",
  },
  {
    slug: "email-list-for-creators",
    title: "Building an email list as a creator",
    blurb: "Why a list beats the algorithm, and how to start one that drives sales.",
  },
  {
    slug: "tiktok-shop",
    title: "Selling with TikTok Shop",
    blurb: "Setting up TikTok Shop and creating content that converts inside the app.",
  },
  {
    slug: "walmart-creator",
    title: "Adding Walmart Creator to your mix",
    blurb: "A second storefront and income stream from the content you already make.",
  },
  {
    slug: "negotiating-brand-deals",
    title: "Negotiating brand deals and rates",
    blurb: "Knowing your worth, writing the pitch, and negotiating a rate you feel good about.",
  },
  {
    slug: "pitching-brands",
    title: "Pitching the brands you already love",
    blurb: "Turning products you already promote into paid partnerships with a simple pitch.",
  },
  {
    slug: "content-batching-workflow",
    title: "Content batching and workflow",
    blurb: "Systems and tools that let you create a week of content in an afternoon.",
  },
  {
    slug: "finding-your-niche",
    title: "Finding and owning your niche",
    blurb: "Picking a lane that is profitable, sustainable, and truly yours.",
  },
  {
    slug: "staying-authentic",
    title: "Staying authentic while selling",
    blurb: "Recommending products in a way that keeps your audience's trust for the long haul.",
  },
  {
    slug: "tools-and-automation",
    title: "Tools and automation that save you hours",
    blurb: "The apps and systems that take the busywork off a creator's plate.",
  },
];

export const BUNDLE_TOPICS: BundleTopic[] = RAW_TOPICS.map((t) => ({
  ...t,
  capacity: t.capacity ?? DEFAULT_CAPACITY,
}));

/** Total contributor slots across all topics (for landing-page copy). */
export const TOTAL_SLOTS = BUNDLE_TOPICS.reduce((sum, t) => sum + t.capacity, 0);

/** Look up one topic by slug. */
export function topicBySlug(slug: string): BundleTopic | undefined {
  return BUNDLE_TOPICS.find((t) => t.slug === slug);
}

/** Format a bundle ISO date for display, e.g. "October 3, 2026". */
export function formatBundleDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  } catch {
    return iso;
  }
}
