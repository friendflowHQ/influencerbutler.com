import { butlerTier } from "@/lib/entitlements";

export type FeatureEntry = {
  slug: string;
  title: string;
  description: string;
  url: string;
  /** "free" = free forever on any account; "pro" = trial and Pro only. */
  tier: "free" | "pro";
};

const BASE = "https://www.influencerbutler.com";

function entry(slug: string, title: string, description: string): FeatureEntry {
  return { slug, title, description, url: `${BASE}/features/${slug}`, tier: butlerTier(slug) };
}

export const FEATURE_CATALOG: FeatureEntry[] = [
  entry("action-queue", "Action Queue: Everything running, in one place", "Action Queue manages and runs your pending tasks across all Influencer Butler tools in the background."),
  entry("amazon-butler", "Amazon Butler: Message brands without typing twice", "Amazon Butler sends your message to brands in Creator Connections, follows up for you, and keeps a safe pace so your account stays healthy."),
  entry("api-integrations", "API Integrations: Everything plugs into Butler", "API Integrations connect Influencer Butler to Archer, Levanta, Amazon Creators API, GeniusLink, URLGenius, Linktw.in, and more."),
  entry("audit-console", "Audit Console: See exactly what Butler did", "Audit Console logs every action Butler takes across all workspaces. Filter by severity, time range, or workspace. Search and export logs."),
  entry("benable-butler", "Benable Butler: Build a Benable collection from one keyword", "Benable Butler builds a Benable affiliate collection from a single niche keyword - the AI handles strategy, product search, and per-item notes. Beta."),
  entry("benable-like-butler", "Benable Like Butler: Auto-like Benable collections", "Benable Like Butler likes Benable collection items at a pace that keeps your account healthy. Set your limits and walk away. Free forever - works on trial, paid, expired, or cancelled."),
  entry("black-friday-butler", "Black Friday Butler: Don't sleep through the surge", "Black Friday Butler ranks Creator Connections opportunities by margin and recency during the seasonal surge so you chase what matters first."),
  entry("cc-check", "CC Check: Grab every ASIN from any page", "CC Check pulls every Amazon product code from any link in seconds. Paste a storefront, blog post, or competitor page and export every ASIN to CSV. Free forever - works on trial, paid, expired, or cancelled."),
  entry("cc-deals", "Campaign Deals: Track on-sale items in your campaigns", "Campaign Deals shows which products in the Creator Connections campaigns you're in are on sale right now, with the discount, sale price, deal end time, and your commission rate. Refresh on demand or on a schedule, sorted by biggest discount."),
  entry("close-friends-butler", "Close Friends Butler: Grow your Close Friends list on autopilot", "Close Friends Butler adds people to your Instagram Close Friends on a safe schedule. Queue them up once and walk away."),
  entry("collab-butler", "Collab Butler: Never lose track of a brand deal", "Collab Butler gives every brand a card. Stages, due dates, notes. Every brand you message with Amazon Butler shows up here automatically."),
  entry("content-butler", "Content Butler: Plan your content like a calendar, not a mess", "Content Butler shows your brand deliverables on a Monthly, Weekly, or Daily view. Tag by brand. Search by product or ASIN. Miss fewer deadlines."),
  entry("daily-commission-butler", "Daily Commission Butler: Never miss a paid campaign", "Daily Commission Butler watches your storefront for new Creator Connections offers and accepts them the moment they show up. Never miss a paid campaign again."),
  entry("daily-deals-butler", "Amazon Daily Deals: Post the best deals faster", "Amazon Daily Deals finds hot deals that match your filters and lines them up for posting. Deals land in a queue - you post when you're ready."),
  entry("earnings-intelligence", "Earnings Intelligence: See what's actually making money", "Earnings Intelligence shows your top earners, trends, and hidden winners across dates, stores, and marketplaces. A monthly breakdown splits every month by source (Onsite, Creator Connections, Brand deals, Bonus, International) and exports to CSV or Excel. Stop guessing what's making you money."),
  entry("feedback", "Feedback: Tell us what's broken in one click", "Feedback sends your bug report or feature request straight to us from inside the app. One click. We read every one."),
  entry("goldmine-butler", "Goldmine Butler: Find the brands already paying creators", "Goldmine Butler scans other creators' storefronts for #ad and #partner posts, then tells you the brand names, ASINs, and product titles. Hot leads, ready to pitch."),
  entry("group-invite-butler", "Group Invite Butler: Grow your Facebook group on autopilot", "Group Invite Butler invites the creator emails you harvested into your Facebook group, one at a time, at a safe human pace. Load a CSV or send emails over from a Goldmine, and Butler skips anyone it already invited."),
  entry("instagram-butler", "Instagram Butler: DM outreach that doesn't feel like a full-time job", "Instagram Butler sends your DM to Instagram users with a safe pace and auto follow-ups. One template, steady pace, Instagram doesn't complain."),
  entry("instagram-email-collection", "Instagram Email Collection: Grab business contact emails", "Instagram Email Collection scans Instagram profiles and pulls the business contact emails into a single list. Ready-to-outreach, export-to-CSV."),
  entry("levanta-butler", "Levanta Butler: Brand outreach for Levanta", "Levanta Butler messages brands in the Levanta network for you and pulls contact emails from your Levanta feed."),
  entry("like-butler", "Like Butler: Auto-like storefronts the safe way", "Like Butler likes storefronts at a pace that keeps your account happy. Set your limits and walk away. Free forever - works on trial, paid, expired, or cancelled."),
  entry("messenger-butler", "Messenger Butler: Clean up your Amazon inbox", "Messenger Butler pulls your Amazon messages in, tags them, and lets you quick-reply. One tidy inbox instead of five open tabs."),
  entry("orders-butler", "Orders Butler: Pull your full Amazon order history", "Orders Butler pulls your full Amazon order history in one click. No more copy-paste row by row. Free forever - works on trial, paid, expired, or cancelled."),
  entry("pinterest-butler", "Pinterest Butler: Idea Lists in. Pins out.", "Pinterest Butler turns your Amazon Idea Lists into scheduled, SEO-optimized pins with affiliate links wrapped automatically. Coming soon."),
  entry("pitch-butler", "Pitch Butler: One outbound queue for every brand source", "Pitch Butler unifies brand contacts from Levanta, Instagram, and Creator Connections into one outbound pitch queue with status pills and built-in follow-ups."),
  entry("prime-day-butler", "Prime Day Butler: Win Prime Day without the scramble", "Prime Day Butler unlocks June 10–July 1 and surfaces Prime Day deals you can post about: content you already made, products you already own, and fresh discoveries - with CC/SPCC opportunity flags and one-click handoff to Amazon Daily Deals."),
  entry("pricecrash-butler", "Pricecrash Butler: Catch Amazon pricing errors fast", "Pricecrash Butler scans Amazon on a schedule for products discounted ≥99% off and queues catches in Amazon Daily Deals - as drafts for review or auto-scheduled posts. Threshold is configurable down to 50% for a broader steep-discount radar."),
  entry("retag-butler", "Retag Butler: Fix dead product links in your old content", "Retag Butler finds content tagged to products that aren't sold anymore and adds a live replacement - without wiping your original tag. Dead tags get a live backup."),
  entry("storefront-butler", "Storefront Butler: Know your storefront inside and out", "Storefront Butler syncs every product in your storefront and shows you how many photos and videos you have for each one, so you know exactly what still needs content. Free forever - works on trial, paid, expired, or cancelled."),
  entry("video-reload-butler", "Video Reload Butler: Re-upload videos Amazon deleted", "Video Reload Butler restores videos that Amazon removed, refreshes their info, and flips them between horizontal and vertical for you."),
  entry("voiceover-butler", "Voiceover Butler: AI voiceover with FTC disclosures baked in", "Voiceover Butler writes AI voiceover scripts in your tone, niche, and audience - with FTC disclosures baked in and brand-safety guards on every script. For fashion items it grounds the script in your own fit (height and sizing) so viewers can gauge how things will look."),
  entry("youtube-butler", "YouTube Butler: Turn storefront videos into YouTube views", "YouTube Butler uploads your storefront videos to YouTube and stamps your affiliate QR code right on the video."),
];

export type PricingTier = {
  id: string;
  name: string;
  priceUsd: number | "free";
  cadence: "free" | "trial" | "monthly" | "annual";
  /** Seat count for Pro tiers, or null for the free tier. */
  seats: number | null;
  highlights: string[];
  signupUrl: string;
};

// IDs "monthly" and "annual" are preserved as the Solo plans so MCP
// consumers that hard-coded the legacy strings keep working; the new
// team-/agency- entries are explicit. Prices mirror PRICE_CENTS in
// src/lib/pricing-constants.ts - update there first, this file second.
export const PRICING_TIERS: PricingTier[] = [
  {
    id: "free",
    name: "Free forever",
    priceUsd: "free",
    cadence: "free",
    seats: null,
    highlights: [
      "The whole Chrome extension, no login: video counts, content gaps, Butler Approved seals, storefront checks",
      "Desktop free butlers: Like Butler, Benable Like Butler, CC Check, Orders Butler, Storefront Butler",
      "No card, no expiry",
    ],
    signupUrl: `${BASE}/extension`,
  },
  {
    id: "trial",
    name: "3-day Pro trial",
    priceUsd: "free",
    cadence: "trial",
    seats: 1,
    highlights: [
      "Full Pro Solo access for 3 days",
      "All 40+ butlers unlocked",
      "Cancel anytime before day 3",
    ],
    signupUrl: `${BASE}/pricing`,
  },
  {
    id: "monthly",
    name: "Pro Solo Monthly",
    priceUsd: 39,
    cadence: "monthly",
    seats: 1,
    highlights: ["All 40+ butlers unlocked", "1 activated device", "Cancel anytime"],
    signupUrl: `${BASE}/welcome/monthly`,
  },
  {
    id: "annual",
    name: "Pro Solo Annual",
    priceUsd: 390,
    cadence: "annual",
    seats: 1,
    highlights: ["All 40+ butlers unlocked", "Save 17% vs monthly", "1 activated device"],
    signupUrl: `${BASE}/welcome/annual`,
  },
  {
    id: "team-monthly",
    name: "Pro Team Monthly",
    priceUsd: 129,
    cadence: "monthly",
    seats: 10,
    highlights: ["Everything in Pro Solo", "Up to 10 activated devices", "Priority email support"],
    signupUrl: `${BASE}/pricing`,
  },
  {
    id: "team-annual",
    name: "Pro Team Annual",
    priceUsd: 1290,
    cadence: "annual",
    seats: 10,
    highlights: ["Everything in Pro Solo", "Up to 10 devices", "Save 17% vs monthly"],
    signupUrl: `${BASE}/pricing`,
  },
  {
    id: "agency-monthly",
    name: "Pro Agency Monthly",
    priceUsd: 299,
    cadence: "monthly",
    seats: 25,
    highlights: ["Everything in Pro Team", "Up to 25 devices", "Dedicated support"],
    signupUrl: `${BASE}/pricing`,
  },
  {
    id: "agency-annual",
    name: "Pro Agency Annual",
    priceUsd: 2990,
    cadence: "annual",
    seats: 25,
    highlights: ["Everything in Pro Team", "Up to 25 devices", "Save 17% vs monthly"],
    signupUrl: `${BASE}/pricing`,
  },
];
