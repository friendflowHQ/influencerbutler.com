// Curated growth-idea library for the monthly checklist.
//
// pickMonthlyIdeas() deterministically rotates through the library so each
// month starts with a fresh, category-balanced set of 6 ideas. seedChecklist()
// inserts them once per month, guarded by the app_config marker plus
// library_key dedupe.

import {
  readMonthMarker,
  writeMonthMarker,
  isMissingTable,
  type GoalsClient,
} from "@/lib/growth-goals";

export type IdeaCategory = "content" | "affiliates" | "conversion" | "retention" | "community";

export type GrowthIdea = {
  key: string;
  category: IdeaCategory;
  title: string;
  description: string;
};

export const GROWTH_IDEA_LIBRARY: GrowthIdea[] = [
  // Content
  {
    key: "blog_seo_post",
    category: "content",
    title: "Publish one SEO blog post",
    description:
      "Target a search creators actually type, like 'how to find brand deals on Instagram' or 'Amazon influencer storefront tips', and link the free trial.",
  },
  {
    key: "youtube_demo",
    category: "content",
    title: "Record a 3-minute Butler demo",
    description:
      "Screen-record one butler doing something impressive end to end. Post to YouTube and embed it on the matching feature page and Help & Tutorials.",
  },
  {
    key: "tiktok_before_after",
    category: "content",
    title: "Post a before/after workflow clip",
    description:
      "Show the manual way vs the Butler way of one creator task in under 30 seconds. TikTok, Reels, and Shorts all at once.",
  },
  {
    key: "comparison_page",
    category: "content",
    title: "Ship a comparison landing page",
    description:
      "'Influencer Butler vs doing it by hand' or vs a named alternative: honest table, pricing, and a trial CTA. Comparison pages convert searchers late in the funnel.",
  },
  // Affiliates
  {
    key: "recruit_five_affiliates",
    category: "affiliates",
    title: "Pitch the affiliate program to 5 creators",
    description:
      "DM five mid-size creators in the niche with a personal note and the 30% recurring pitch. Recruiting beats waiting for applications.",
  },
  {
    key: "affiliate_spotlight",
    category: "affiliates",
    title: "Send your top affiliate a swipe kit",
    description:
      "Email your best-performing affiliate ready-to-post copy, screenshots, and their link. Make promoting you the easiest thing they do this week.",
  },
  {
    key: "affiliate_leaderboard_post",
    category: "affiliates",
    title: "Shout out the top earner",
    description:
      "Post an affiliate-earnings shoutout in the Facebook group (with their permission). Social proof recruits the next wave of affiliates.",
  },
  {
    key: "nudge_inactive_affiliates",
    category: "affiliates",
    title: "Nudge zero-click affiliates",
    description:
      "Check the affiliate analytics tab for affiliates with no clicks this month and send them one fresh content idea plus their link.",
  },
  // Conversion
  {
    key: "trial_email_tune",
    category: "conversion",
    title: "Rewrite the weakest trial email",
    description:
      "Look at the day 0-3 trial drip: find the email with the worst engagement and rewrite it around one concrete win the user should try today.",
  },
  {
    key: "pricing_page_test",
    category: "conversion",
    title: "Tweak one pricing-page element",
    description:
      "Change a single headline, CTA label, or objection-handler on the pricing page and watch trial clicks for the month. One change so you can tell what moved.",
  },
  {
    key: "testimonial_on_landing",
    category: "conversion",
    title: "Feature 2 fresh testimonials",
    description:
      "Pick two recent 5-star testimonials and feature them on the homepage feed. Recency reads as momentum.",
  },
  {
    key: "soft_cta_copy",
    category: "conversion",
    title: "Refresh the newsletter soft-CTA",
    description:
      "Rewrite the footer/blog newsletter pitch around a concrete takeaway ('one growth tactic every Thursday') instead of 'subscribe for updates'.",
  },
  // Retention
  {
    key: "winback_cancelled",
    category: "retention",
    title: "Win back last month's cancels",
    description:
      "Email everyone who cancelled last month: ask what was missing, and offer a hand getting set up properly. One reply is worth the send.",
  },
  {
    key: "checkin_new_trials",
    category: "retention",
    title: "Personally email day-3 trials",
    description:
      "Send a short personal note to this month's trial starts on day 3: 'What's the one thing you hoped Butler would do?' Founder emails get answered.",
  },
  {
    key: "changelog_post",
    category: "retention",
    title: "Publish a what's-new post",
    description:
      "Round up the month's improvements into a short changelog post or email. Subscribers who see momentum stay subscribed.",
  },
  // Community
  {
    key: "answer_all_questions",
    category: "community",
    title: "Clear the Q&A queue to zero",
    description:
      "Answer every open community question. Fast answers turn browsers into trialers and trialers into fans.",
  },
  {
    key: "fb_group_challenge",
    category: "community",
    title: "Run a weekly engagement thread",
    description:
      "Start a recurring thread in the Facebook group ('share this week's win') and seed the first replies yourself.",
  },
  {
    key: "ask_testimonials",
    category: "community",
    title: "Ask 3 happy users for a testimonial",
    description:
      "Pick three engaged subscribers and personally ask for a testimonial with the collection link. Personal asks convert far better than automated ones.",
  },
];

export const IDEAS_PER_MONTH = 6;

/**
 * The library interleaved category round-robin (content, affiliates,
 * conversion, retention, community, content, ...). With 3-4 ideas per
 * category, any cyclic window of 6 holds at most 2 ideas of one category,
 * so a plain sliding window stays balanced without skip logic.
 */
function interleavedLibrary(): GrowthIdea[] {
  const byCategory = new Map<IdeaCategory, GrowthIdea[]>();
  for (const idea of GROWTH_IDEA_LIBRARY) {
    const list = byCategory.get(idea.category);
    if (list) list.push(idea);
    else byCategory.set(idea.category, [idea]);
  }
  const buckets = [...byCategory.values()];
  const out: GrowthIdea[] = [];
  for (let round = 0; out.length < GROWTH_IDEA_LIBRARY.length; round++) {
    for (const bucket of buckets) {
      if (round < bucket.length) out.push(bucket[round]);
    }
  }
  return out;
}

/**
 * Deterministic month rotation: a sliding window of `count` ideas over the
 * category-interleaved library. The same month always yields the same set;
 * consecutive months advance the window so the whole library cycles through
 * every 3 months.
 */
export function pickMonthlyIdeas(month: string, count = IDEAS_PER_MONTH): GrowthIdea[] {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return [];
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const library = interleavedLibrary();
  const offset = ((year * 12 + monthIndex) * count) % library.length;

  return Array.from(
    { length: Math.min(count, library.length) },
    (_, i) => library[(offset + i) % library.length],
  );
}

/**
 * Seeds the month's checklist from the library exactly once. Idempotent via
 * the app_config marker; a concurrent double-seed is additionally softened by
 * checking existing library_keys first.
 */
export async function seedChecklist(
  supabase: GoalsClient,
  month: string,
): Promise<{ migrationPending: boolean }> {
  const marker = await readMonthMarker(supabase, month);
  if (marker.checklist_seeded_at) return { migrationPending: false };

  const existing = await supabase
    .from("growth_checklist_items")
    .select("library_key")
    .eq("month", month);
  if (existing.error) {
    if (isMissingTable(existing.error)) return { migrationPending: true };
    console.error("growth: checklist seed lookup failed", existing.error);
    return { migrationPending: false };
  }
  const already = new Set(
    (existing.data ?? [])
      .map((r) => (typeof r.library_key === "string" ? r.library_key : null))
      .filter(Boolean),
  );

  const rows = pickMonthlyIdeas(month)
    .filter((idea) => !already.has(idea.key))
    .map((idea, i) => ({
      month,
      title: idea.title,
      description: idea.description,
      category: idea.category,
      source: "library",
      library_key: idea.key,
      sort: (i + 1) * 10,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("growth_checklist_items").upsert(rows);
    if (error) {
      if (isMissingTable(error)) return { migrationPending: true };
      console.error("growth: checklist seed insert failed", error);
      return { migrationPending: false };
    }
  }

  await writeMonthMarker(supabase, month, { checklist_seeded_at: new Date().toISOString() });
  return { migrationPending: false };
}
