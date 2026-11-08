// App-trial nurture drip - plain-text emails via Resend. Mirrors
// src/lib/free-onboarding-emails.ts in style (direct sendMarketingEmail, no
// template library). Sent by the /api/cron/affiliate-funnel cron in its
// sendAppTrialEmails step.
//
// Audience: people who installed the desktop app and typed their email into
// the startup walkthrough (email_subscribers rows with app_trial_started_at
// set, enrolled by /api/app-trial/signup). They are on the local 14-day app
// trial: no card, no Lemon Squeezy subscription, so nothing auto-charges and
// nothing chases them. A trial that picked Beginner at sign-in sees the
// Beginner butlers (AI included); one that picked Power User, or predates the
// plan split, sees every butler.
//
// The copy is Liz's, first ported from the lifecycle worker that was written
// but never deployed (workers/lifecycle/src/lib/templates.js in the desktop
// repo), then rewritten for Funnels v2 (Nov 2026): plan-aware, Windows and Mac
// install notes, prices from pricing-constants, no Power-only butlers pitched
// to Beginner.
//
// Funnels v2 layout (content keys, see funnel-types.ts):
//   APP_TRIAL_COPY[tier]   bare copy = the "unknown" base (no plan picked) and
//                          the fallback for every tailored key without copy
//   APP_TRIAL_TRACK_COPY   per-base copy where the plan changes the email
//                          (day0, day1, day5, day14, day17), registered below
//   funnel-modules.ts      module copy for the module slots (day3, day5, day10)
//
// Shape of the arc: days 0 to 10 are activation; day12 and day14 are the
// trial-ending nudges (price lock while it lasts); days 17 to 30 are a short,
// spaced lapsed tail that stops crowding the inbox.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { withFunnelExperiment } from "@/lib/funnel-experiment-send";
import { lifecycleFrom } from "@/lib/email-senders";
import { getFunnelOverrides, resolveFunnelCopy, resolveFunnelCopyForKey } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import { registerTrackCopy, lookupTrackCopy, type TrackCopyMap, type TrackCopyVars } from "@/lib/funnel-track-registry";
import { parseContentKey } from "@/lib/funnel-types";
import {
  AI_LINES,
  BEGINNER_HELP_URL,
  DOWNLOAD_URL,
  EXTENSION_HELP_URL,
  EXTENSION_URL,
  POWER_HELP_URL,
  SITE,
  UPGRADE_HELP_URL,
  firstNameOf,
  installNotes,
  paragraphs,
  trackVars,
} from "@/lib/funnel-modules";

export type AppTrialTier =
  | "day0"
  | "day1"
  | "day3"
  | "day5"
  | "day7"
  | "day10"
  | "day12"
  | "day14"
  | "day17"
  | "day21"
  | "day30";

export type AppTrialVars = {
  firstName: string;
  pricingUrl: string; // /pricing, optionally carrying a ?code= discount
  helpUrl: string;
  discountCode: string | null;
  discountPercent: number;
  // Funnels v2 track vars (funnel-personalize buildTrackVars). Optional: the
  // copy falls back to safe values from pricing-constants when absent.
  aiLine?: string;
  priceLockLine?: string;
  price?: string;
  beginnerPrice?: string;
  eventLine?: string;
  goalLine?: string;
  bookCallUrl?: string;
};

export type TierCopy = {
  subject: string | ((vars: AppTrialVars) => string);
  build: (vars: AppTrialVars) => string;
};

const FROM_ADDRESS = lifecycleFrom();
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;
const DCB_HELP_URL = `${SITE}/help/tutorials/dailycommissionbutler`;

// The six free-forever butlers, kept in sync with entitlements.ts, trial day14,
// and the onboarding drip. These keep running after the app trial ends, which
// is why the later emails can stay warm instead of reading as a shutdown notice.
const FREE_BUTLERS =
  "Like Butler, Benable Like Butler, Instagram Like Butler, CC Check, Orders Butler, and Storefront Butler";

function asVars(v: AppTrialVars | TrackCopyVars): TrackCopyVars {
  return v as unknown as TrackCopyVars;
}

/** "Setting it up on another computer" block: link plus both OS notes. */
function secondComputerBlock(): string[] {
  return [`Setting it up on another computer too? Get the app here: ${DOWNLOAD_URL}`, ...installNotes()];
}

const FOUNDER_INTRO = `Liz here. I actually built Influencer Butler, so this is really me, and I read replies.`;
const FOUNDER_BACKSTORY = `Quick background: I've been an Instagram influencer for 11 years, on TikTok for 6, and an Amazon influencer for 4. For most of that I was drowning in busywork. Chasing brand deals, checking commissions, DMing, liking, keeping 200+ accounts alive. I hired a VA. I hired an agent. I still felt behind. So I built butlers to do the boring parts for me. That's what you just set up.`;
const DCB_ONE_LINER = `It reads what you sold recently and your storefront best-sellers, then accepts the matching Creator Connections campaigns (the ones that pay a bonus commission on top of your normal rate) once a day.`;
const TIME_HEADS_UP = `Heads-up on the bigger picture: that first run is a few minutes, but getting every butler you want set up end to end is more like a 30-90 minute project, mostly hands-off. Spread it across a few sittings.`;
const REPLY_ASK = `One favor: hit reply and tell me what you're hoping this saves you from. I read every one, and it shapes what I build next.`;

// ---------------------------------------------------------------------------
// Bare copy (the "unknown" base, and the fallback for every tailored key)
// ---------------------------------------------------------------------------

export const APP_TRIAL_COPY: Record<AppTrialTier, TierCopy> = {
  day0: {
    subject: "You're in: Beginner or Power User? A 60-second guide",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `Hey ${v.firstName},`,
        FOUNDER_INTRO,
        FOUNDER_BACKSTORY,
        t.goalLine,
        `The fastest way to get it is to run one butler today. Open the app and start with Daily Commission Butler. ${DCB_ONE_LINER} Click Run once first: it shows you the list without accepting anything.`,
        `While you're trying things, one decision is worth a minute: which plan fits you.`,
        [
          `  - Beginner (${t.beginnerPrice}): the starter butlers that earn first (deal posting, brand outreach, Daily Commission Butler, Video and Photo Reload, your Foyer page), AI included, and a guided fast track.`,
          `  - Power User (${t.price}): every butler, unlimited AI on your own OpenAI key, and 1:1 calls with the team.`,
        ],
        `New to all this? Beginner. Already know your way around the Amazon Influencer Program and want the whole toolbox? Power User. You can switch any time, and your settings come with you.`,
        TIME_HEADS_UP,
        secondComputerBlock(),
        REPLY_ASK,
        `- Liz`,
      );
    },
  },
  day1: {
    subject: "Did Daily Commission Butler find anything?",
    build: (v) =>
      paragraphs(
        `Hey ${v.firstName},`,
        `Checking in on day one. If you ran Daily Commission Butler yesterday, you should be looking at a list of Creator Connections campaigns on products you already sell, each one paying a bonus commission you'd otherwise miss.`,
        `If you haven't run it yet, it's three clicks:`,
        [
          `  1. Run CC Check so the campaign list is fresh.`,
          `  2. Open Daily Commission Butler and click Run once (a preview, nothing is accepted yet).`,
          `  3. If the list looks right, accept them and switch on the daily schedule.`,
        ],
        `Empty list? It usually means Orders Butler hasn't synced yet. Run it once and try again.`,
        `If something looked off, reply and tell me what you saw. I'll help you sort it.`,
        `Step-by-step tutorials for every butler: ${v.helpUrl}`,
        `- Liz`,
      ),
  },
  day3: {
    subject: "I fired my agent. Here's what happened.",
    build: (v) =>
      paragraphs(
        `${v.firstName},`,
        `For a while I had an agent and a VA. On paper that's the dream. In reality I was paying a lot of money every month to still be the bottleneck, because nobody knew my accounts or my voice like I did, and explaining it took longer than doing it.`,
        `So I started automating the pieces myself. Outreach to brands. Creator Connections campaigns. The endless engagement work across all my accounts. One by one, the things I was paying humans to do became butlers that ran on their own.`,
        `Eventually I let the agent and the VA go. That was the scary part. But my income didn't drop. My hours did. I got my evenings back, and I stopped feeling like I was managing a small company just to run my own influencer business.`,
        `That's the entire reason Influencer Butler exists. It's not a startup idea someone dreamed up. It's the actual system I run my career on, packaged so you can run yours on it too.`,
        `You've got plenty of trial left. If there's one task you'd love to never do again, reply and tell me. There's a decent chance a butler already handles it.`,
        `- Liz`,
      ),
  },
  day5: {
    subject: "The butler that pitches brands while you're logged off",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `Hey ${v.firstName},`,
        `Landing brand deals used to be my least favorite job. Find the brand, find the contact, write the pitch, follow up, track who replied, do it again a hundred times. It's the kind of work an agent takes a cut for and still does slowly.`,
        `Amazon Butler does it for you. It sets up Creator Connections outreach to the brands behind your top-selling products and keeps track of it all, so you're not living in a spreadsheet of "did I follow up with them yet". It runs on your own computer: no shared server, no stranger's IP touching your account.`,
        `If you've ever felt like you're leaving brand money on the table just because outreach is exhausting, this is the one to try today. Open the app, go to Amazon Butler, and let it run.`,
        `Bonus: the AI Keyword Generator helps your outreach target the right products instead of guessing. ${t.aiLine}`,
        `- Liz`,
      );
    },
  },
  day7: {
    subject: "Halfway there: come hang out on our next group call",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `${v.firstName},`,
        `You're halfway through your trial, so I want to invite you to something.`,
        `When I started automating my business, the thing that helped most wasn't a tool. It was other creators. Someone who'd already figured out the setup, who could say "do this first, skip that". That's why we run live group calls: you bring your questions, I answer them on the spot, and you hear what's working for creators like you.`,
        t.eventLine,
        `Inside the app, the Pro Lounge is where creators trade setups and wins between calls. Pop in and say hi.`,
        `And if there's one butler you haven't got running yet, this is a good week for it. Reply and tell me which one, and I'll point you at the fastest way in.`,
        COMMUNITY_LINE,
        `- Liz`,
      );
    },
  },
  day10: {
    subject: "Want to see your hours-saved number?",
    build: (v) =>
      paragraphs(
        `Hey ${v.firstName},`,
        `By now you've probably run a few butlers. Here's something most people miss: the app is tracking what it's saving you.`,
        `Look at the top of the dashboard. There's Hours Saved and Money Saved, and there's a spot to put in your hourly rate so the money number reflects what your time is actually worth. (On Power User, Earnings Intelligence goes deeper, showing which products and links actually earned.)`,
        `I added these because I needed proof, for myself, that automating wasn't just a fun project but real time and money back in my pocket. When I saw the hours add up, I stopped second-guessing whether to let my VA go.`,
        `Go look at your number. Then ask yourself what you'd do with that time every week. Reply and tell me, I'm curious what you'd reclaim.`,
        `- Liz`,
      ),
  },
  day12: {
    subject: (v) =>
      trackVars(asVars(v), "unknown").priceLockLine
        ? `2 days left, ${v.firstName}: lock in today's price`
        : `Your trial wraps in 2 days, ${v.firstName}`,
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `${v.firstName},`,
        `Your trial ends in two days, so I wanted to give you a heads up rather than let it surprise you.`,
        t.priceLockLine,
        `If the butlers have earned a spot in your routine, staying on is simple and everything you've set up stays exactly as it is. Beginner starts at ${t.beginnerPrice} with AI included. Power User is ${t.price} for every butler.`,
        `See the plans: ${v.pricingUrl}`,
        `If you're not sure yet, that's fair too. Tell me what's holding you back, honestly, and I'll give you a straight answer about whether this is right for you. I would rather you not pay than pay for something that isn't a fit.`,
        `- Liz`,
      );
    },
  },
  day14: {
    subject: (v) => `Today's the day, ${v.firstName}`,
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `Hey ${v.firstName},`,
        `Your trial ends today. Here's the simple version.`,
        `If you keep going, the butlers keep doing the work: the Creator Connections campaigns, the brand outreach, the deals, all of it running quietly in the background while you do the parts only you can do. That's the trade I make every single day, and it's the best money I spend on my business.`,
        [
          `  - Beginner, ${t.beginnerPrice}: the starter butlers, AI included.`,
          `  - Power User, ${t.price}: every butler, your own OpenAI key, 1:1 calls.`,
        ],
        t.priceLockLine,
        v.discountCode ? `If today is the day, use code ${v.discountCode} for ${v.discountPercent}% off your first month.` : null,
        `Keep your butlers running: ${v.pricingUrl}`,
        `If you'd rather not, no hard feelings. Your free-forever butlers (${FREE_BUTLERS}) and the whole Chrome extension keep working. No card, no expiry.`,
        `And if something's stopping you that I could actually fix, reply and tell me. I read everything.`,
        `- Liz`,
      );
    },
  },
  day17: {
    subject: "Did something get in the way?",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `${v.firstName},`,
        `Your trial ended a few days ago and you didn't continue, which is completely fine. But I've learned that when someone tries the butlers and doesn't stay, it's usually one of three things:`,
        [
          `  1. They didn't get a butler fully running and never hit the "oh, that's amazing" moment.`,
          `  2. The timing was off and life got busy.`,
          `  3. It's just not for them right now.`,
        ],
        `If it's the first one, reply and tell me which butler you were trying. I'll personally help you get it working, even though your trial is over. I'd rather you make a real decision than a busy one.`,
        `Or bring it to a group call and we'll sort it out live. ${t.eventLine}`,
        `- Liz`,
      );
    },
  },
  day21: {
    subject: "What I used to pay a human to do this",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `Hey ${v.firstName},`,
        `Let me put real numbers on this, because it's what finally moved me.`,
        `A VA who could half-handle my engagement and outreach ran me well into four figures a month, and I still had to manage them. An agent took a percentage of deals on top of that. And neither one worked at 2am, or on weekends, or across every account at once.`,
        `The butlers cost a tiny fraction of that and never clock out. That's not a knock on great VAs, I've worked with wonderful people. It's just that the repetitive work was never the part that needed a human. It needed a system.`,
        `If cost was the question, Beginner is ${t.beginnerPrice}, AI included, and you can move up to Power User later in one click without losing a thing.`,
        t.priceLockLine,
        `Your setup is right where you left it. Pick up where you left off: ${v.pricingUrl}`,
        `- Liz`,
      );
    },
  },
  day30: {
    subject: "I'll stop crowding your inbox",
    build: (v) =>
      paragraphs(
        `${v.firstName},`,
        `I'm going to ease off, because the last thing I want is to be the founder cluttering your inbox.`,
        `Before I do: the reason I keep building isn't to chase signups. It's that I lived the version of this work where you do everything by hand or pay people a fortune to half-do it, and I don't want anyone stuck there. The butlers are how I got out.`,
        `In the meantime, your free-forever butlers and the Chrome extension keep working. And if and when the timing's right, everything you set up is still saved and waiting. I'll check in now and then with useful stuff, not a sales pitch.`,
        `Reactivate whenever you're ready: ${v.pricingUrl}`,
        `- Liz`,
      ),
  },
};

// ---------------------------------------------------------------------------
// Track copy (per base), registered in the Funnels v2 registry
// ---------------------------------------------------------------------------

const UPDATED = "2026-11-08";

function pricing(v: TrackCopyVars): string {
  return String(v.pricingUrl ?? `${SITE}/pricing`);
}

function help(v: TrackCopyVars): string {
  return String(v.helpUrl ?? `${SITE}/help`);
}

function discountLine(v: TrackCopyVars): string | null {
  const code = v.discountCode ? String(v.discountCode) : "";
  if (!code) return null;
  return `If today is the day, use code ${code} for ${String(v.discountPercent ?? "")}% off your first month.`;
}

const FREE_FOREVER_LINE = `If you'd rather not, no hard feelings. Your free-forever butlers (${FREE_BUTLERS}) and the whole Chrome extension keep working. No card, no expiry.`;

export const APP_TRIAL_TRACK_COPY: TrackCopyMap = {
  "day0.beginner": {
    subject: "You're in. AI is already switched on.",
    updatedAt: UPDATED,
    build: (v) => {
      const t = trackVars(v, "beginner");
      return paragraphs(
        `Hey ${firstNameOf(v)},`,
        FOUNDER_INTRO,
        `You picked Beginner, which I think is the smart way in. You get the butlers that earn first, in the order that makes sense, without 50 menus to wade through.`,
        t.goalLine,
        AI_LINES.beginner,
        `The walkthrough in the app is your fast track. Pick "Start with the basics (Beginner plan)" and it sets things up in this order:`,
        [
          `  1. Your Amazon marketplaces and Storefront IDs, so every link you post is credited to you.`,
          `  2. Creator API credentials: a free, five-minute setup on Amazon. If Amazon won't let you create them yet, the app offers our backup credentials so you can keep going.`,
          `  3. A scan of your storefront, so the butlers know your products.`,
          `  4. The free Chrome extension (${EXTENSION_URL}), then Collage Butler.`,
          `  5. Last, Deals quick setup: keywords, your Facebook groups and a posting schedule.`,
        ],
        `Closed the walkthrough early? Rerun it any time from Settings: the First-run walkthrough card has Resume and Start over.`,
        `Then run one butler today: Daily Commission Butler. ${DCB_ONE_LINER} Click Run once first to preview the list.`,
        `Everything about your plan: ${BEGINNER_HELP_URL}`,
        secondComputerBlock(),
        REPLY_ASK,
        `- Liz`,
      );
    },
  },
  "day0.power": {
    subject: "You're in. One key, then one butler.",
    updatedAt: UPDATED,
    build: (v) => {
      const t = trackVars(v, "power");
      return paragraphs(
        `Hey ${firstNameOf(v)},`,
        FOUNDER_INTRO,
        `You picked Power User, so you have the whole toolbox. The fastest way in is two steps, and that's all I'd do today.`,
        t.goalLine,
        [
          `  1. Add your OpenAI key. Open AI & Data Keys in the left menu, paste the key and click Test. Until it's in, AI buttons show a lock; nothing else waits on it.`,
          `  2. Run Daily Commission Butler. ${DCB_ONE_LINER} Click Run once to preview the list first.`,
        ],
        AI_LINES.power,
        `After that, the walkthrough sets up only what your goal needs: posting deals to groups you already run, auto-accepting Creator Connections and SPCC campaigns, or uploading your videos and photos to other Amazon marketplaces. Rerun it any time from Settings: the First-run walkthrough card has Resume and Start over.`,
        t.bookCallUrl ? `Rather talk it through? Book a free setup call and we'll set it up with you: ${t.bookCallUrl}` : null,
        `Everything about your plan: ${POWER_HELP_URL}`,
        secondComputerBlock(),
        REPLY_ASK,
        `- Liz`,
      );
    },
  },
  "day0.starter": {
    subject: "Brand new? Your first 20 minutes.",
    updatedAt: UPDATED,
    build: (v) => {
      const t = trackVars(v, "starter");
      return paragraphs(
        `Hey ${firstNameOf(v)},`,
        FOUNDER_INTRO,
        `You told the app you're just getting started. Welcome! Everyone starts here, me included, and you don't need to understand all 50+ butlers. You need about 20 minutes and three things.`,
        `When the walkthrough asks about your Amazon account, pick "Brand new, walk me through everything". It takes you through these in order:`,
        [
          `  1. Applying to Amazon Associates or the Amazon Influencer Program. Both are free.`,
          `  2. Storefront IDs: the tracking IDs that make sure every link you share pays you.`,
          `  3. Your first affiliate link.`,
        ],
        `Creator API credentials can come later. Brand-new accounts often can't create them yet. That's normal, and the app offers our backup credentials so you can keep going.`,
        `That's it for today. Everything else can wait until those three are done.`,
        t.aiLine,
        `Tutorials for every step, written for beginners: ${help(v)}`,
        secondComputerBlock(),
        `Stuck anywhere? Hit reply and tell me where. I read every one, and no question is too basic.`,
        `- Liz`,
      );
    },
  },
  "day1.beginner": {
    subject: "The 5-minute Amazon setup every butler needs",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `If you only do one thing today, make it this. Most butlers look up products on Amazon, and they do it through the Creator API. It's free, it takes about five minutes, and once it's in, everything else just works.`,
        [
          `  1. In the app, open Amazon Butler, then Amazon Settings.`,
          `  2. Paste your Creator API credentials and your storefront ID, then click Test Connection.`,
          `  3. Check your Partner Tag is your Associates tracking ID (like yourtag-20), not a storefront ID. A wrong tag is the most common reason the test fails.`,
        ],
        `Test failed with an eligibility error? Amazon only unlocks the Creator API after enough qualifying sales. Click "Use Influencer Butler's backup credentials" and you're running in one click. Your own tags still track to you, so the commissions are still yours.`,
        `Once that's green, run Daily Commission Butler (Run once first) and see which bonus-paying Creator Connections campaigns are already waiting on your products.`,
        `Walkthrough (with a two-minute video): ${SITE}/help/tutorials/getting-started-influencer-butler`,
        `Reply if anything looks off. I'll help you sort it.`,
        `- Liz`,
      ),
  },
  "day1.power": {
    subject: "the bonus commissions you haven't claimed yet",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `One thing to try today. It takes about five minutes.`,
        `Amazon runs Creator Connections campaigns that pay a bonus commission on top of your normal rate. Plenty of them are on products you already sell, and they pay nothing unless you accept them.`,
        `Daily Commission Butler finds and accepts them for you:`,
        [
          `  1. In the desktop app, run CC Check so the campaign list is fresh.`,
          `  2. Open Daily Commission Butler and click Run once.`,
          `  3. Look at the list: campaigns on products you sold recently or that top your storefront. Run once only previews; nothing is accepted until you click Accept all.`,
        ],
        `If the list looks right, accept them and switch on the daily schedule. From then on it claims new matches once a day without you.`,
        `Empty list? Usually Orders Butler hasn't synced in the last couple of days, or the CC Storefront ID isn't saved. Fix that and run it again.`,
        `Next up on Power User: point Amazon Butler at the brands behind your best-sellers, with the campaign value filters switched on.`,
        `Full walkthrough: ${DCB_HELP_URL}`,
        `Reply and tell me how many it found. I read every reply.`,
        `- Liz`,
      ),
  },
  "day5.beginner": {
    subject: "Add the free Chrome extension (2 minutes)",
    updatedAt: UPDATED,
    build: (v) =>
      paragraphs(
        `Hey ${firstNameOf(v)},`,
        `Quick one today. A lot of your money decisions happen in the browser, on Amazon's own pages, so the butlers have a free Chrome extension that works right there.`,
        `What it adds:`,
        [
          `  - On Creator Connections: a score on every campaign card, how full each campaign is, and Accept buttons (plus an Auto mode you can switch on).`,
          `  - The Butler's Brief: a quick AI verdict on a campaign, what to film and which product to lead with.`,
          `  - On Creator Hub: what each of your videos earned.`,
          `  - On Walmart and Target product pages: price, estimated commission and a Butler Score.`,
          `  - Branded links, and links localized for 12 Amazon marketplaces.`,
        ],
        `It's free on every account and takes about two minutes to add: ${EXTENSION_URL}`,
        `Then pair it with the desktop app and they work together. Tutorial: ${EXTENSION_HELP_URL}`,
        `- Liz`,
      ),
  },
  "day14.beginner": {
    subject: (v) => `Today's the day, ${firstNameOf(v)}`,
    updatedAt: UPDATED,
    build: (v) => {
      const t = trackVars(v, "beginner");
      return paragraphs(
        `Hey ${firstNameOf(v)},`,
        `Your trial ends today. Here's the simple version.`,
        `Beginner is ${t.beginnerPrice}. That keeps your starter butlers running (Deal Posting, brand outreach, Daily Commission Butler, Video and Photo Reload, your Foyer page) with AI included, so there's no OpenAI account to set up.`,
        t.priceLockLine,
        `And it's not a dead end. When you want more, Power User is one click away and your settings, keywords and earnings history come with you: ${UPGRADE_HELP_URL}`,
        discountLine(v),
        `Keep your butlers running: ${pricing(v)}`,
        FREE_FOREVER_LINE,
        `If something's stopping you that I could actually fix, reply and tell me. I read everything.`,
        `- Liz`,
      );
    },
  },
  "day14.power": {
    subject: (v) => `Today's the day, ${firstNameOf(v)}`,
    updatedAt: UPDATED,
    build: (v) => {
      const t = trackVars(v, "power");
      return paragraphs(
        `Hey ${firstNameOf(v)},`,
        `Your trial ends today. Here's the simple version.`,
        `Power User is ${t.price}: every butler, unlimited AI on your own OpenAI key, and 1:1 calls with the team. Everything you've set up stays exactly as it is.`,
        `Not using all of it yet? Start on Beginner at ${t.beginnerPrice} instead. It keeps the starter butlers running with AI included, and you can move up to Power User in one click whenever you're ready.`,
        t.priceLockLine,
        discountLine(v),
        `Pick your plan: ${pricing(v)}`,
        FREE_FOREVER_LINE,
        `If something's stopping you that I could actually fix, reply and tell me. I read everything.`,
        `- Liz`,
      );
    },
  },
  "day17.power": {
    subject: "Did something get in the way?",
    updatedAt: UPDATED,
    build: (v) => {
      const t = trackVars(v, "power");
      return paragraphs(
        `${firstNameOf(v)},`,
        `Your trial ended a few days ago and you didn't continue, which is completely fine. But when someone picks Power User and doesn't stay, it's usually because the setup felt like a lot. Fifty-plus butlers is a big toolbox.`,
        `If that's you, let's fix it together. Reply and tell me the one thing you wanted the app to do, and I'll tell you exactly which butler and which three settings get you there.`,
        t.bookCallUrl
          ? `Rather talk it through? Book a call with the team and we'll set it up with you: ${t.bookCallUrl}`
          : `Rather talk it through? Bring it to a group call and we'll sort it out live. ${t.eventLine}`,
        `And if the toolbox was simply more than you need right now, Beginner is ${t.beginnerPrice} with AI included: ${pricing(v)}`,
        `- Liz`,
      );
    },
  },
};

registerTrackCopy("apptrial", APP_TRIAL_TRACK_COPY);

// ---------------------------------------------------------------------------
// Send
// ---------------------------------------------------------------------------

export type AppTrialEmailPayload = {
  tier: AppTrialTier;
  to: string;
  name: string;
  pricingUrl: string;
  helpUrl: string;
  discountCode: string | null;
  discountPercent: number;
  /** Funnels v2: the content key the send path chose ("day3.mod-walmart.power").
   * Omitted (or FUNNELS_V2 off) = bare tier, exactly the old behavior. */
  contentKey?: string;
  /** Funnels v2 track vars from funnel-personalize buildTrackVars. */
  trackVars?: Partial<
    Pick<AppTrialVars, "aiLine" | "priceLockLine" | "price" | "beginnerPrice" | "eventLine" | "goalLine" | "bookCallUrl">
  >;
};

function renderTier(copy: TierCopy, vars: AppTrialVars): { subject: string; body: string } {
  const subject = typeof copy.subject === "function" ? copy.subject(vars) : copy.subject;
  return { subject, body: copy.build(vars) };
}

/** Code copy for exactly `key` in the app-trial funnel: the bare tier's copy,
 * or tailored registry copy (track or module), else null. Same contract as
 * system-funnels makeCodeDefaultForKey, without importing it (cycle). */
export function appTrialCodeDefaultForKey(
  key: string,
  vars: AppTrialVars,
): { subject: string; body: string } | null {
  const p = parseContentKey(key);
  if (!p) return null;
  if (!p.base && !p.module) {
    const copy = APP_TRIAL_COPY[p.tier as AppTrialTier];
    return copy ? renderTier(copy, vars) : null;
  }
  const entry = lookupTrackCopy("apptrial", key);
  if (!entry) return null;
  const tv = asVars(vars);
  const subject = typeof entry.subject === "function" ? entry.subject(tv) : entry.subject;
  return { subject, body: entry.build(tv) };
}

export async function sendAppTrialEmail(payload: AppTrialEmailPayload): Promise<boolean> {
  const copy = APP_TRIAL_COPY[payload.tier];
  const firstName = payload.name.split(" ")[0] || "there";

  const vars: AppTrialVars = {
    firstName,
    pricingUrl: payload.pricingUrl,
    helpUrl: payload.helpUrl,
    discountCode: payload.discountCode,
    discountPercent: payload.discountPercent,
    ...(payload.trackVars ?? {}),
  };

  const overrides = await getFunnelOverrides();
  const key = payload.contentKey && parseContentKey(payload.contentKey) ? payload.contentKey : null;
  const resolved = key
    ? resolveFunnelCopyForKey({
        funnel: "apptrial",
        contentKey: key,
        vars: asVars(vars),
        overrides,
        codeDefaultForKey: (k) => appTrialCodeDefaultForKey(k, vars),
      })
    : resolveFunnelCopy({
        funnel: "apptrial",
        tier: payload.tier,
        vars: asVars(vars),
        defaults: renderTier(copy, vars),
        overrides,
      });
  // Funnels v2 only (content key supplied): A/B overlay + step tracking.
  const sendCopy = key
    ? await withFunnelExperiment({
        funnel: "apptrial",
        contentKey: key,
        email: payload.to,
        control: { subject: resolved.subject, body: resolved.body },
        vars: asVars(vars),
      })
    : { subject: resolved.subject, body: resolved.body, tracking: {} };
  const ok = await sendMarketingEmail({
    from: FROM_ADDRESS,
    to: payload.to,
    subject: sendCopy.subject,
    text: sendCopy.body,
    category: `apptrial_${payload.tier}`,
    funnel: "apptrial",
    trackOpens: true,
    ...sendCopy.tracking,
  });
  if (ok && resolved.applyTag) {
    try {
      await tagRecipientsAsContacts(
        createAdminClient(),
        [payload.to],
        resolved.applyTag,
        "funnel:apptrial",
      );
    } catch (err) {
      console.error("app-trial-emails: tag-on-send failed", err);
    }
  }
  return ok;
}
