// Funnels v2: module copy. One email per walkthrough module, tailored by base
// track where the plan changes what the person can actually use:
//
//   MODULE_COPY[module].shared     everyone (unknown and starter bases, and any
//                                  base without its own entry)
//   MODULE_COPY[module][base]      only where the plan changes the story
//
// Module slots (app trial day3/day5/day10, trial day1/day7) pick the person's
// ranked modules (funnel-personalize rankModules); someone with no module at a
// slot gets that step's base copy instead. Content keys:
//   "<tier>.mod-<module>"          -> shared entry (registered as "*.mod-<module>")
//   "<tier>.mod-<module>.<base>"   -> base entry   (registered as "*.mod-<module>.<base>")
//
// Every claim here is checked against the product (fact sheet, Nov 2026):
// Daily Commission Butler auto-accepts matching Creator Connections campaigns
// once a day, it is on Beginner; Walmart Butler, Social Posting Butler,
// Instagram Butler, Close Friends Butler, YouTube Butler and Earnings
// Intelligence are Power User; the Chrome extension is free on every account.
// Never mention unannounced extension features or the deal-site importer.
//
// Imports only the dependency-free Funnels v2 layer and pricing constants, so
// copy files can import this module without a cycle through system-funnels.

import { registerTrackCopy, type TrackCopyEntry, type TrackCopyMap, type TrackCopyVars } from "@/lib/funnel-track-registry";
import { MODULE_KEYS, MODULE_KEY_PREFIX, type ModuleKey, type PlanBase } from "@/lib/funnel-types";
import { LEVEL_PRICE_CENTS, PRICE_CHANGE, priceChangeActive } from "@/lib/pricing-constants";

export const SITE = "https://www.influencerbutler.com";
export const EXTENSION_URL = `${SITE}/extension/get`;
export const EXTENSION_HELP_URL = `${SITE}/help/tutorials/extension`;
export const DOWNLOAD_URL = `${SITE}/download`;
export const EVENTS_URL = `${SITE}/events`;
export const OPENAI_SETUP_URL = `${SITE}/help/tutorials/openai-api-setup`;
export const BEGINNER_HELP_URL = `${SITE}/help/tutorials/beginner-start-here`;
export const POWER_HELP_URL = `${SITE}/help/tutorials/power-user-start-here`;
export const UPGRADE_HELP_URL = `${SITE}/help/tutorials/upgrade-to-power-user`;

/** Date in copy for copy updates (COPY_UPDATED_AT owns the truth). */
const UPDATED = "2026-11-08";

// ---------------------------------------------------------------------------
// Shared helpers for every Funnels v2 copy file
// ---------------------------------------------------------------------------

/** String var or fallback (never "undefined"/"null"). */
export function str(v: TrackCopyVars, key: string, fallback = ""): string {
  const x = v[key];
  if (x === undefined || x === null) return fallback;
  const s = String(x).trim();
  return s.length > 0 ? s : fallback;
}

export function firstNameOf(v: TrackCopyVars): string {
  return str(v, "firstName", "there");
}

/** Joins paragraphs with one blank line, dropping empty ones. A paragraph may
 * itself be an array of lines (a list), joined with single newlines. Empty
 * optional vars such as priceLockLine (blank after the price change) then
 * vanish without leaving a double gap. */
export function paragraphs(...blocks: Array<string | string[] | null | undefined | false>): string {
  const out: string[] = [];
  for (const b of blocks) {
    if (!b) continue;
    const text = Array.isArray(b) ? b.filter((l) => l && l.length > 0).join("\n") : b;
    if (text.trim().length > 0) out.push(text);
  }
  return out.join("\n\n");
}

function dollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

export type TrackVarValues = {
  aiLine: string;
  priceLockLine: string;
  price: string;
  beginnerPrice: string;
  eventLine: string;
  goalLine: string;
  bookCallUrl: string;
};

/** Plan-fixed AI lines. Base-specific copy states its own plan's fact with
 * these; the {{aiLine}} var (which may describe both plans) is used in copy
 * for people whose plan is unknown. */
export const AI_LINES = {
  beginner:
    "AI is included on Beginner: 150 AI actions a month on our key, so you never need an OpenAI account to get started.",
  power: `Power User runs unlimited AI on your own OpenAI API key. You pay OpenAI directly for what you use (a few dollars a month for most creators), and a ChatGPT subscription does not work. Five-minute guide: ${OPENAI_SETUP_URL}`,
  either:
    "About AI: on Beginner it is included (150 AI actions a month on our key). On Power User it is unlimited on your own OpenAI API key, which you pay OpenAI for directly.",
} as const;

/** The person's track vars, with safe fallbacks for any that the send path did
 * not supply (FUNNELS_V2 off, or an older cron). funnel-personalize
 * buildTrackVars is the real source; these only keep copy correct without it.
 * Prices come from pricing-constants, never literals. bookCallUrl never gets a
 * fallback: a call link is only shown when the send path says the person can
 * book one. */
export function trackVars(v: TrackCopyVars, base: PlanBase = "unknown"): TrackVarValues {
  const beginnerCents = LEVEL_PRICE_CENTS.beginner.solo?.monthly ?? 0;
  const powerCents = LEVEL_PRICE_CENTS.power.solo?.monthly ?? 0;
  const aiFallback = base === "beginner" ? AI_LINES.beginner : base === "power" ? AI_LINES.power : AI_LINES.either;
  // Has the send path filled the price-lock var at all? An explicit "" means
  // "price change is over", so only a missing key falls back.
  const lockProvided = Object.prototype.hasOwnProperty.call(v, "priceLockLine") && v.priceLockLine != null;
  let priceLockLine = lockProvided ? String(v.priceLockLine).trim() : "";
  if (!lockProvided && priceChangeActive()) {
    const when = PRICE_CHANGE.dayLabel;
    priceLockLine = `Prices go up for new subscriptions after ${when}. Start before then and you keep today's price for as long as you stay subscribed.`;
  }
  return {
    aiLine: str(v, "aiLine", aiFallback),
    priceLockLine,
    price: str(v, "price", `${dollars(powerCents)}/month`),
    beginnerPrice: str(v, "beginnerPrice", `${dollars(beginnerCents)}/month`),
    eventLine: str(
      v,
      "eventLine",
      `See the upcoming live group calls and save a seat: ${EVENTS_URL}`,
    ),
    goalLine: str(v, "goalLine"),
    bookCallUrl: str(v, "bookCallUrl"),
  };
}

/** Windows + Mac install notes, for any copy that mentions installing. */
export function installNotes(): string[] {
  return [
    `  On Windows: if you see "Windows protected your PC", click More info, then Run anyway. That screen is normal for new apps.`,
    `  On Mac: open the .dmg, drag Influencer Butler into Applications and open it from there. If macOS hesitates, right-click the app and choose Open.`,
  ];
}

const SIGN_OFF = "- Liz";

// ---------------------------------------------------------------------------
// Module copy
// ---------------------------------------------------------------------------

export type ModuleCopySet = { shared: TrackCopyEntry } & Partial<Record<PlanBase, TrackCopyEntry>>;

const DCB_STEPS = [
  `  1. In the desktop app, run CC Check so the campaign list is fresh.`,
  `  2. Open Daily Commission Butler and click Run once. It reads what you sold recently and your storefront best-sellers, then lists the matching campaigns. Run once is only a preview: nothing is accepted yet.`,
  `  3. If the list looks right, accept them and switch on the daily schedule. From then on it accepts new matches once a day without you.`,
];
const DCB_DEFAULTS = `Out of the box it only picks campaigns paying at least 5%, on products with at least one sale in the last 30 days, and it skips anything ending within 48 hours. You can change all three.`;
const DCB_EMPTY = `Empty list? Daily Commission Butler needs Orders Butler to have synced in the last couple of days, and your CC Storefront ID saved. Run Orders Butler once and try again.`;
const DCB_HELP = `Walkthrough: ${SITE}/help/tutorials/dailycommissionbutler`;
const EXTENSION_CC = `Working in Chrome? The free Chrome extension puts a score on every Creator Connections campaign card, shows how full each campaign is, and adds Accept buttons plus an Auto mode you can switch on. Free on every account: ${EXTENSION_URL}`;

const CC_AUTO: ModuleCopySet = {
  shared: {
    subject: "The bonus commissions sitting on products you already sell",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You told the app you want Creator Connections campaigns accepted for you, so this one is all about that.`,
        `Amazon runs Creator Connections campaigns that pay a bonus commission on top of your normal rate. Plenty of them are on products you already sell, and they pay nothing unless you accept them. Checking by hand is tedious, which is exactly why most creators miss them.`,
        `Here's how to hand it to a butler:`,
        DCB_STEPS,
        DCB_DEFAULTS,
        DCB_EMPTY,
        EXTENSION_CC,
        DCB_HELP,
        `Reply and tell me how many it found. I read every reply.`,
        SIGN_OFF,
      ),
  },
  beginner: {
    subject: "Your Beginner plan can accept CC campaigns for you",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You told the app you want Creator Connections campaigns accepted for you. Good news: the butler that does it, Daily Commission Butler, is part of Beginner.`,
        `Creator Connections campaigns pay a bonus commission on top of your normal rate, and plenty of them are on products you already sell. They pay nothing unless you accept them. Here's how to let the butler do it:`,
        DCB_STEPS,
        DCB_DEFAULTS,
        `Posting deals too? Deal Posting has a switch called "Auto-accept CC campaigns before posting", so every deal you share is already earning the bonus.`,
        DCB_EMPTY,
        EXTENSION_CC,
        DCB_HELP,
        `Reply and tell me how many it found. I read every reply.`,
        SIGN_OFF,
      ),
  },
  power: {
    subject: "Put Creator Connections on autopilot (the Power User way)",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You told the app you want Creator Connections campaigns accepted for you. Here's the full setup I'd use on Power User.`,
        `Start with the bonus money you're already owed. Daily Commission Butler finds Creator Connections campaigns on products you sell and accepts them once a day:`,
        DCB_STEPS,
        DCB_DEFAULTS,
        `Then go after the brands. Amazon Butler reaches out to the brands behind your top-selling products through Creator Connections, and on Power User the campaign value filters are switched on, so you can aim it at the campaigns worth your time.`,
        `In Chrome, the free extension scores every campaign card, shows how full each one is (with a Last Call alert when a campaign you're watching is nearly full), and scores Sponsored Products for Creators campaigns on EPC and budget: ${EXTENSION_URL}`,
        DCB_EMPTY,
        DCB_HELP,
        `Reply and tell me how many it found on the first run. I read every reply.`,
        SIGN_OFF,
      ),
  },
};

const WALMART_EXTENSION = [
  `  - On Walmart product pages: price, rating, estimated commission and a Butler Score.`,
  `  - On rollback and savings pages: the real markdowns, so you can spot a postable deal in seconds.`,
  `  - Tracked links through Mavely or Walmart Creator, so the commission is yours.`,
  `  - On Target product pages: the same money signals, plus an "Also on Walmart or Target" card so you can compare before you share.`,
];
const WALMART_BUTLER = [
  `  - Walmart Repost copies your Amazon storefront videos and photos to your Walmart Creator storefront, only when it is the exact same item on Walmart.`,
  `  - Collection Builder turns one of your Amazon lists into a matching Walmart collection, after you review it.`,
  `  - Walmart Performance reads your Walmart Creator sales and commission into the app, so you can see what is earning without opening the portal.`,
  `  - Walmart Research keeps price and rank history for the Walmart products you look up.`,
];

const WALMART: ModuleCopySet = {
  shared: {
    subject: "Your Walmart and Target links, sorted",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You picked Walmart in the walkthrough, so let's get it earning next to Amazon.`,
        `Start in your browser. The free Chrome extension works on every account:`,
        WALMART_EXTENSION,
        `Add it here: ${EXTENSION_URL}`,
        `Then, in the desktop app, Walmart Butler does the heavy lifting. It is part of Power User:`,
        WALMART_BUTLER,
        `If you're deciding between plans, this is a good test: if Walmart is a real channel for you, Walmart Butler is the reason to pick Power User. If it's a side channel, the extension alone covers a lot.`,
        `Walkthrough: ${SITE}/help/tutorials/walmart-repost`,
        `Reply and tell me how you sell on Walmart today. I read every reply.`,
        SIGN_OFF,
      ),
  },
  beginner: {
    subject: "Your Walmart and Target links, sorted (free)",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You picked Walmart in the walkthrough. A lot of the Walmart side is free, so here's what you can use today without changing anything.`,
        `The free Chrome extension:`,
        WALMART_EXTENSION,
        `Add it here: ${EXTENSION_URL}`,
        `Want Walmart deals in Deal Posting too? WAL Deals Finder is off by default on Beginner, but you can switch it on yourself in the app.`,
        `When Walmart grows into a real channel, Walmart Butler is the next step. It reposts your Amazon storefront to Walmart Creator, builds Walmart collections from your Amazon lists and pulls your Walmart Creator numbers into the app. That one is part of Power User, and moving up is one click whenever you're ready: ${UPGRADE_HELP_URL}`,
        `Reply and tell me how you sell on Walmart today. I read every reply.`,
        SIGN_OFF,
      ),
  },
  power: {
    subject: "Walmart Butler: your storefront, on Walmart, hands-free",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You picked Walmart in the walkthrough, and on Power User you have the whole Walmart toolkit. Here's where I'd start.`,
        `In the desktop app, open Walmart Butler:`,
        WALMART_BUTLER,
        `Walmart Repost has a Set it up wizard that signs you in and configures it in about a minute. Start there.`,
        `For Walmart deals, WAL Deals Finder feeds Deal Posting the same way the Amazon one does.`,
        `And in Chrome, the free extension covers the browsing side:`,
        WALMART_EXTENSION,
        `Add it here: ${EXTENSION_URL}`,
        `Walkthrough: ${SITE}/help/tutorials/walmart-repost`,
        `Reply and tell me how it goes. I read every reply.`,
        SIGN_OFF,
      ),
  },
};

const DEALS_STEPS = [
  `  1. Connect your Facebook group.`,
  `  2. Pick a niche.`,
  `  3. Press Start.`,
];

const DEALS: ModuleCopySet = {
  shared: {
    subject: "Post deals to your groups without lifting a finger",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You said you post deals, so this one is for you.`,
        `I used to spend hours a week hunting deals, checking the discount was real, writing the post and sharing it to my groups. Deal Posting (it used to be called Deals Influencer Butler) does all of that. AMZ Deals Finder finds deals from your keywords and filters them on price, discount and commission, then Deal Posting shares them to your Facebook groups and pages on a schedule.`,
        `The fastest start is the Quickstart, three steps:`,
        DEALS_STEPS,
        `Two butlers keep it tidy behind the scenes: Posted Deals Log remembers what you've already shared, and Expired Butler cleans up posts for deals that have ended.`,
        `One switch worth flipping: "Auto-accept CC campaigns before posting". It accepts any matching Creator Connections campaign first, so the deal earns the bonus commission too.`,
        `Quickstart walkthrough: ${SITE}/help/tutorials/deals-guided-setup`,
        `Reply and tell me your niche. I read every reply.`,
        SIGN_OFF,
      ),
  },
  power: {
    subject: "Deals on autopilot: Amazon and Walmart, every group",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You said you post deals, so here's the setup I'd use on Power User.`,
        `Deal Posting (formerly Deals Influencer Butler) finds deals and shares them to your Facebook groups and pages on a schedule. AMZ Deals Finder filters Amazon deals on price, discount and commission. On Power User, WAL Deals Finder does the same for Walmart, so one schedule can mix both.`,
        `Start with the three-step Quickstart:`,
        DEALS_STEPS,
        `Then open Advanced setup when you want Walmart, more destinations and finer control.`,
        `Flip "Auto-accept CC campaigns before posting" so every Amazon deal earns any matching Creator Connections bonus. Posted Deals Log and Expired Butler keep your groups clean.`,
        `Walkthrough: ${SITE}/help/tutorials/deals-guided-setup`,
        `Reply and tell me your niche. I read every reply.`,
        SIGN_OFF,
      ),
  },
};

const IG_STORY = `People don't believe me when I say I run over 200 Instagram accounts. Then they remember I founded The Comment Pod, and it clicks: I've spent years on one problem, which is how to do the engagement work at scale without it eating your life. Posting is the easy part. The grind is everything around it.`;

const SOCIAL: ModuleCopySet = {
  shared: {
    subject: "How I run 200+ Instagram accounts (without losing my mind)",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `${firstNameOf(v)},`,
        IG_STORY,
        `So I built butlers for it. On every plan:`,
        [
          `  - Instagram Like Butler likes at a safe pace so your account stays active and visible. Free forever.`,
          `  - Deal Posting shares deals to your Facebook groups and pages on a schedule.`,
        ],
        `On Power User:`,
        [
          `  - Social Posting Butler publishes your own evergreen posts on a schedule, with your photo, caption and link.`,
          `  - Instagram Butler sends first-touch DMs to brands with rotating templates and a do-not-message list.`,
          `  - Close Friends Butler adds new followers to your Close Friends list with strict hourly and daily limits.`,
        ],
        `You don't need 200 accounts to feel this. Even on one, handing the repetitive part to a butler is the difference between "I'll get to it" and "it's already done". Pick one and let it run today.`,
        SIGN_OFF,
      ),
  },
  beginner: {
    subject: "Keep your socials busy while you're offline",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `${firstNameOf(v)},`,
        IG_STORY,
        `Here's what you can hand off on Beginner today:`,
        [
          `  - Instagram Like Butler likes at a safe pace so your account stays active and visible. It's free forever.`,
          `  - Deal Posting shares deals to your Facebook groups and pages on a schedule, so your groups stay busy without you.`,
          `  - Your Foyer page gives you a shoppable link-in-bio built from your own products and deals.`,
        ],
        `Pick one and let it run today. Liking is the easiest first win: set your pace once and leave it.`,
        `Later, if you want your own evergreen posts scheduled, brand DMs on Instagram or your Close Friends list filled automatically, those are Power User butlers (Social Posting, Instagram Butler and Close Friends Butler). Moving up is one click: ${UPGRADE_HELP_URL}`,
        SIGN_OFF,
      ),
  },
  power: {
    subject: "How I run 200+ Instagram accounts (your Power User setup)",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `${firstNameOf(v)},`,
        IG_STORY,
        `On Power User you have every one of the butlers I use for it:`,
        [
          `  1. Social Posting Butler: load your own evergreen posts once (photo, caption, link or a first-comment link) and they publish on a schedule, with delivery reporting and content recycling.`,
          `  2. Instagram Butler: first-touch DMs to brands and creators with rotating templates, follower-count filters and a do-not-message list.`,
          `  3. Close Friends Butler: adds new followers to your Close Friends list with per-hour and per-day limits, which is where a lot of quiet sales happen.`,
          `  4. Instagram Like Butler: safe-pace liking that keeps the account active.`,
        ],
        `Start with one. Social Posting is my pick if your feed goes quiet when you're busy.`,
        `Walkthrough: ${SITE}/help/tutorials/social-posting-butler`,
        SIGN_OFF,
      ),
  },
};

const VIDEO_MONEY = `In Chrome, the free extension adds Video Money to Creator Hub: every video shows what it earned, earnings per view, its commission rate and a demand badge, so you know which videos to make more of: ${EXTENSION_URL}`;

const VIDEO: ModuleCopySet = {
  shared: {
    subject: "Get more out of the videos you've already made",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You said video is your thing, so let's make the videos you've already shot work harder.`,
        `Video Reload Butler re-uploads your existing Amazon storefront videos with fresh titles, descriptions and tags, without reshooting anything, and it can re-post your US storefront videos to Canada, the UK, Australia and Singapore. Photo Reload does the same for photos. Both are on every plan.`,
        VIDEO_MONEY,
        `On Power User, YouTube Butler loads your storefront videos to YouTube with AI titles and descriptions, your affiliate links and a daily upload schedule. Same videos, a whole new audience.`,
        `Walkthrough: ${SITE}/help/tutorials/video-reload-butler`,
        `Reply and tell me how many videos you have on your storefront. I read every reply.`,
        SIGN_OFF,
      ),
  },
  beginner: {
    subject: "Your old videos can earn again (no reshoot)",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You said video is your thing. Here's the quickest win on Beginner.`,
        `Video Reload Butler takes the storefront videos you've already made and re-uploads them with fresh titles, descriptions and tags, on your US storefront or out to Canada, the UK, Australia and Singapore. No reshoot, no editing. Photo Reload does the same for photos, including ones Amazon removed.`,
        VIDEO_MONEY,
        `YouTube Like Butler is on your plan too, if you want to keep up with the channels you follow without the scrolling.`,
        `When you're ready to put the same videos on YouTube, YouTube Butler is a Power User tool: ${UPGRADE_HELP_URL}`,
        `Walkthrough: ${SITE}/help/tutorials/video-reload-butler`,
        SIGN_OFF,
      ),
  },
  power: {
    subject: "One video, two marketplaces, plus YouTube",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You said video is your thing, and on Power User every video tool is yours. Here's the order I'd go in:`,
        [
          `  1. Video Reload Butler: re-upload your storefront videos with fresh titles, descriptions and tags, including to Canada, the UK, Australia and Singapore. No reshoot.`,
          `  2. YouTube Butler: a guided setup that loads your storefront to YouTube with AI titles, your affiliate links, thumbnails and a daily upload schedule.`,
          `  3. Photo Reload: the same idea for photos, across marketplaces.`,
        ],
        `${VIDEO_MONEY} With the desktop app paired, a YouTube status chip on each video gives you an Upload button right there.`,
        `Walkthrough: ${SITE}/help/tutorials/youtube-butler`,
        `Reply and tell me which one you start with. I read every reply.`,
        SIGN_OFF,
      ),
  },
};

const OFFSITE_STEPS = [
  `  1. Storefront IDs: your on-site and off-site tracking IDs, so every link you post is credited to you.`,
  `  2. Creator API credentials: a free, five-minute setup on Amazon that lets the butlers look up products. They live in Amazon Butler, then Amazon Settings. If Amazon won't let you create them yet, the app offers our backup credentials so you can keep going, and your own tags still track to you.`,
  `  3. Deeplink Butler: branded links that open the Amazon shopping app, plus a ledger of where you posted each one and whether it's still healthy.`,
  `  4. Foyer Butler: your own shoppable link-in-bio page, built from your products and deals.`,
];

const AMAZON_OFFSITE: ModuleCopySet = {
  shared: {
    subject: "Every link you post, tracked and earning",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You said you share Amazon links off Amazon (your socials, groups, bio), so this one is about making sure every one of those links earns.`,
        `Four things, in this order:`,
        OFFSITE_STEPS,
        `In Chrome, the free extension adds branded links and the Global Maximizer, which localizes your links for 12 Amazon marketplaces, so followers in other countries land on their own Amazon store: ${EXTENSION_URL}`,
        `Reply and tell me where most of your links go. I read every reply.`,
        SIGN_OFF,
      ),
  },
  power: {
    subject: "Find out which of your links actually earn",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `You said you share Amazon links off Amazon, so here's the Power User setup for it.`,
        `First the basics, in order:`,
        OFFSITE_STEPS,
        `Then the part I check every week: Earnings Intelligence. It tracks your commissions by source, storefront and product over time, so you can tell which links made money and which only drove clicks.`,
        `In Chrome, the free extension adds branded links and the Global Maximizer for 12 Amazon marketplaces: ${EXTENSION_URL}`,
        `Walkthrough: ${SITE}/help/tutorials/earnings-intelligence`,
        SIGN_OFF,
      ),
  },
};

export const MODULE_COPY: Record<ModuleKey, ModuleCopySet> = {
  "cc-auto": CC_AUTO,
  walmart: WALMART,
  deals: DEALS,
  social: SOCIAL,
  video: VIDEO,
  "amazon-offsite": AMAZON_OFFSITE,
};

/** The entry a (module, base) pair gets: the base's own entry, else shared. */
export function moduleCopyFor(module: ModuleKey, base: PlanBase | null | undefined): TrackCopyEntry {
  const set = MODULE_COPY[module];
  return (base && set[base]) || set.shared;
}

/** Wildcard track-copy map for every module: "*.mod-<m>" and, where the base
 * has its own copy, "*.mod-<m>.<base>". Register it under a funnel whose
 * module slots should use this copy. */
export function moduleTrackCopyMap(): TrackCopyMap {
  const map: TrackCopyMap = {};
  for (const m of MODULE_KEYS) {
    const set = MODULE_COPY[m];
    map[`*.${MODULE_KEY_PREFIX}${m}`] = set.shared;
    for (const base of ["beginner", "power", "unknown", "starter"] as PlanBase[]) {
      const entry = set[base];
      if (entry) map[`*.${MODULE_KEY_PREFIX}${m}.${base}`] = entry;
    }
  }
  return map;
}

/** Funnels whose module slots use this copy. Pro welcome and Free onboarding
 * frame modules differently (paid / free tier) and register their own. */
export const MODULE_COPY_FUNNELS = ["apptrial", "trial"] as const;

for (const f of MODULE_COPY_FUNNELS) registerTrackCopy(f, moduleTrackCopyMap());
