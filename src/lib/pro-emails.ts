// Direct-subscriber Pro welcome funnel - plain-text emails via Resend. Mirrors
// src/lib/trial-emails.ts in style (direct fetch, no template library). Sent by
// the /api/cron/affiliate-funnel cron in its sendProEmails step.
//
// These go to customers who subscribed straight to a paid plan (Lemon Squeezy
// status 'active', no free trial). They must never receive the trial sequence
// ("your trial is live", "trial ends today"), so this is a separate track keyed
// off subscriptions.pro_started_at.
//
// Funnels v2: day0 and day2 have separate Beginner and Power User copy,
// registered below as the "day0.beginner" / "day0.power" / "day2.*" content
// keys. The bare tiers stay plan-neutral (they cover the "unknown" track and
// every send while FUNNELS_V2 is off). day5 is a module slot: module copy
// comes from funnel-modules.ts; the bare day5 below is the fallback. day10 is
// the referral + "pause instead of cancel" note.
//
// This file also exports the small shared helpers the other lifecycle copy
// files (free onboarding, win-back, affiliate conversion, upgrade) use:
// default track vars, plan price labels, the Windows + Mac install lines, and
// a local content-key resolver. Copy files must never import system-funnels.ts
// (it imports them), so they resolve content keys through the track registry.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { withFunnelExperiment } from "@/lib/funnel-experiment-send";
import { lifecycleFrom } from "@/lib/email-senders";
import { getFunnelOverrides, resolveFunnelCopyForKey } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import { LEVEL_PRICE_CENTS, PRICE_CHANGE, priceChangeActive, type PlanLevel } from "@/lib/pricing-constants";
import { lookupTrackCopy, registerTrackCopy, type TrackCopyEntry } from "@/lib/funnel-track-registry";
import { parseContentKey } from "@/lib/funnel-types";

// ---------------------------------------------------------------------------
// Shared lifecycle helpers
// ---------------------------------------------------------------------------

const SITE = "https://www.influencerbutler.com";

/** The seven Funnels v2 track variables (funnel-personalize buildTrackVars
 * fills them at send time; defaultLifecycleTrackVars is the safe fallback). */
export type LifecycleTrackVars = {
  aiLine: string;
  priceLockLine: string;
  price: string;
  beginnerPrice: string;
  eventLine: string;
  goalLine: string;
  bookCallUrl: string;
};

export const TRACK_VAR_NAMES: readonly (keyof LifecycleTrackVars)[] = [
  "aiLine",
  "priceLockLine",
  "price",
  "beginnerPrice",
  "eventLine",
  "goalLine",
  "bookCallUrl",
];

/** "$24.99" / "$39" from cents. */
export function formatPlanDollars(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
}

/** Solo monthly price in cents for a level at `now`. After the announced change
 * date it uses PRICE_CHANGE's new price (so copy is right even if
 * LEVEL_PRICE_CENTS has not been bumped yet on the day); before it, today's. */
export function soloMonthlyCents(level: PlanLevel, now: number = Date.now()): number {
  if (!priceChangeActive(now)) {
    const next = PRICE_CHANGE.prices[level]?.solo?.monthly;
    if (typeof next === "number") return next;
  }
  return LEVEL_PRICE_CENTS[level].solo?.monthly ?? 0;
}

/** "$24.99/month" style label for a level's Solo monthly price. */
export function planPriceLabel(level: PlanLevel, now: number = Date.now()): string {
  return `${formatPlanDollars(soloMonthlyCents(level, now))}/month`;
}

/** Day the price change takes effect, in Mountain time ("November 28"). */
export function priceChangeDayLabel(): string {
  return PRICE_CHANGE.dayLabel;
}

/** The generic price-lock sentence, or "" once the change date has passed. */
export function defaultPriceLockLine(now: number = Date.now()): string {
  if (!priceChangeActive(now)) return "";
  return `Prices go up after ${priceChangeDayLabel()} (11:59pm Pacific). Subscribe before then and you keep today's price for as long as your subscription stays active.`;
}

/** Plan-neutral fallback track vars. Every claim matches pricing-constants and
 * the Beginner / Power User tutorials. bookCallUrl stays "" (Power only). */
export function defaultLifecycleTrackVars(now: number = Date.now()): LifecycleTrackVars {
  return {
    aiLine:
      "AI is included on Beginner (150 AI actions a month on our key, no OpenAI account needed). Power User runs unlimited AI on your own OpenAI key, billed by OpenAI directly.",
    priceLockLine: defaultPriceLockLine(now),
    price: planPriceLabel("power", now),
    beginnerPrice: planPriceLabel("beginner", now),
    eventLine: `Come to one of our live group calls and bring your questions: ${SITE}/events`,
    goalLine: "",
    bookCallUrl: "",
  };
}

/** Fills any missing or non-string track var from the defaults. */
export function mergeTrackVars(
  track: Partial<Record<keyof LifecycleTrackVars, unknown>> | null | undefined,
  now: number = Date.now(),
): LifecycleTrackVars {
  const d = defaultLifecycleTrackVars(now);
  const out = { ...d };
  if (track) {
    for (const k of TRACK_VAR_NAMES) {
      const v = track[k];
      if (typeof v === "string") out[k] = v;
    }
  }
  return out;
}

/** String value of a var for copy builders ("" for missing / non-string). */
export function str(v: unknown): string {
  return typeof v === "string" ? v : v === undefined || v === null ? "" : String(v);
}

/** Download chooser page (Mac recipients get the right build, not the .exe). */
export const DOWNLOAD_URL = `${SITE}/download`;
/** Install notes for both operating systems, indented for a numbered list. */
export const INSTALL_LINES: readonly string[] = [
  `     On Windows: run the installer. If you see "Windows protected your PC", click More info, then Run anyway.`,
  `     On Mac: open the .dmg, drag Influencer Butler into Applications and open it from there. If macOS hesitates, right-click the app and choose Open.`,
];

/** Builds the `codeDefaultForKey` callback resolveFunnelCopyForKey expects,
 * without importing system-funnels.ts: a bare key uses this file's own copy,
 * a tailored key uses exactly-registered registry copy (no fallback walk). */
export function makeLocalCodeDefault(
  funnel: string,
  bare: (tier: string) => { subject: string; body: string } | null,
  vars: Record<string, unknown>,
): (key: string) => { subject: string; body: string } | null {
  return (key) => {
    const p = parseContentKey(key);
    if (!p) return null;
    if (!p.base && !p.module) return bare(p.tier);
    const entry = lookupTrackCopy(funnel, key);
    if (!entry) return null;
    return renderTrackEntry(entry, vars);
  };
}

export function renderTrackEntry(entry: TrackCopyEntry, vars: Record<string, unknown>): { subject: string; body: string } {
  const subject = typeof entry.subject === "function" ? entry.subject(vars) : entry.subject;
  return { subject: String(subject ?? ""), body: String(entry.build(vars)) };
}

// ---------------------------------------------------------------------------
// Pro welcome copy
// ---------------------------------------------------------------------------

export type ProTier = "day0" | "day2" | "day5" | "day10";

export type TierCopy = {
  subject: string;
  build: (vars: ProVars) => string;
};

export type ProVars = {
  firstName: string;
  planName: string; // e.g. "Beginner Solo" - falls back to "your Influencer Butler plan"
  subscriptionUrl: string;
} & Partial<LifecycleTrackVars>;

const FROM_ADDRESS = lifecycleFrom();
const AFFILIATE_URL = `${SITE}/dashboard/affiliates`;
const OPENAI_SETUP_URL = `${SITE}/help/tutorials/openai-api-setup`;
const BEGINNER_GUIDE_URL = `${SITE}/help/tutorials/beginner-start-here`;
const POWER_GUIDE_URL = `${SITE}/help/tutorials/power-user-start-here`;
const BOOK_URL = `${SITE}/dashboard/book`;
const EXTENSION_URL = `${SITE}/extension/get`;
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;
const SIGNOFF = "- Liz";

/** Accurate one-liner (desktop dailycommissionbutler + tutorial). */
export const DAILY_COMMISSION_LINE =
  "Daily Commission Butler reads what you sold yesterday and your storefront best-sellers, then auto-accepts the matching Creator Connections campaigns once a day.";

const PAUSE_LINE = (subscriptionUrl: string) =>
  `Need a break at some point? Pause instead of cancelling: from your subscription page you can pause for 1 to 3 months, nothing is charged while paused, and it picks back up on its own. ${subscriptionUrl}`;

function planNameOf(v: ProVars): string {
  return str(v.planName) || "your Influencer Butler plan";
}

function optionalLine(line: string): string[] {
  return line.trim() ? [line, ``] : [];
}

export const PRO_COPY: Record<ProTier, TierCopy> = {
  // Plan-neutral welcome (unknown track, or FUNNELS_V2 off).
  day0: {
    subject: "You're in: welcome to Influencer Butler",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `Liz here, founder of Influencer Butler. Thanks for subscribing to ${planNameOf(v)}. Your plan is active today, no trial countdown.`,
        ``,
        `Three steps to get going:`,
        `  1. Install the desktop app: ${DOWNLOAD_URL}`,
        ...INSTALL_LINES,
        `  2. Paste your license key (on your welcome page) into the app.`,
        `  3. Follow the walkthrough when the app opens. It sets up the butlers on your plan in the right order.`,
        ``,
        ...optionalLine(str(v.aiLine)),
        `The first run takes a couple of minutes. Setting up everything you want end to end is more like a 30-90 minute project you do once, mostly hands-off, so there's no need to rush it.`,
        ``,
        `Manage your plan anytime: ${v.subscriptionUrl}`,
        ``,
        `Questions? Just reply. I read every one.`,
        ``,
        COMMUNITY_LINE,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
  day2: {
    subject: "Your first week: three butlers worth turning on",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `Now that you're set up, these three are where most creators see results first:`,
        ``,
        `  1. Orders Butler: sync your real Amazon order history. It gives the other butlers accurate signal on what you actually sell.`,
        `  2. ${DAILY_COMMISSION_LINE} Click Run once first and you get a preview before anything is accepted.`,
        `  3. Deal Posting (formerly Deals Influencer Butler): finds deals from your keywords and posts them to your Facebook groups and pages on a schedule.`,
        ``,
        `All three are on both Beginner and Power User.`,
        ``,
        `Step-by-step tutorials for every butler: ${SITE}/help`,
        ``,
        `Reply with any question and I'll help.`,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
  // Module slot fallback (no module for this person, or no module copy yet).
  day5: {
    subject: "The free Chrome extension does more than you think",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `The piece most new members miss in their first week is the free Chrome extension. It works right inside Amazon while you browse:`,
        ``,
        `  - Campaign Radar: every Creator Connections campaign card gets a score, and the ones that pass your thresholds get an orange outline.`,
        `  - Fill meter and Last Call: see how full a campaign is, and tap the bell to get a heads-up before it fills.`,
        `  - Auto mode: switch on "Auto-accept campaigns" and it checks for matching campaigns every 30 minutes while Chrome is open and you're signed in to Associates. It's off until you turn it on.`,
        `  - Walmart and Target: Walmart product pages show price, rating, estimated commission and a Butler Score, and Target product pages get money signals too.`,
        ``,
        `Add it to Chrome in two minutes: ${EXTENSION_URL}`,
        ``,
        ...optionalLine(str(v.eventLine)),
        `Manage your plan: ${v.subscriptionUrl}`,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
  day10: {
    subject: "Earn 30% recurring by referring other creators",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `You're a week and a half in. How's it going? If anything is in your way, just reply.`,
        ``,
        `One thing worth knowing: you can join our affiliate program from your dashboard. Refer another creator and earn 30% of their subscription every month for their first 12 months, paid monthly by PayPal. Links carry a 30-day cookie.`,
        ``,
        `Open your affiliate dashboard: ${AFFILIATE_URL}`,
        ``,
        `P.S. ${PAUSE_LINE(v.subscriptionUrl)}`,
        ``,
        COMMUNITY_LINE,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
};

// Beginner / Power User copy for the base-slot steps, registered as content
// keys. Builders take the generic registry vars and coerce what they need.
function pv(vars: Record<string, unknown>): ProVars {
  return {
    ...(vars as Partial<LifecycleTrackVars>),
    firstName: str(vars.firstName) || "there",
    planName: str(vars.planName),
    subscriptionUrl: str(vars.subscriptionUrl) || `${SITE}/dashboard/subscription`,
  };
}

export const PRO_TRACK_COPY: Record<string, TrackCopyEntry> = {
  "day0.beginner": {
    subject: "Welcome to Beginner: your 5-step fast track",
    updatedAt: "2026-11-08",
    build: (vars) => {
      const v = pv(vars);
      return [
        `Hi ${v.firstName},`,
        ``,
        `Liz here, founder of Influencer Butler. Thanks for choosing the Beginner plan. You're all set, no trial countdown.`,
        ``,
        `First, install the desktop app: ${DOWNLOAD_URL}`,
        ...INSTALL_LINES.map((l) => l.replace(/^ {5}/, "  ")),
        ``,
        `Paste your license key from your welcome page, then pick "Start with the basics (Beginner plan)" in the walkthrough. It takes about ten minutes, in this order:`,
        `  1. Your Amazon marketplaces and Storefront IDs, so every link you post is yours.`,
        `  2. Creator API credentials: about five minutes on Amazon, with backup credentials if Amazon won't let you create them yet.`,
        `  3. A scan of your storefront, so the butlers know your products.`,
        `  4. The free Chrome extension, then Collage Butler.`,
        `  5. Last, it hands you to Deals quick setup: your keywords, your Facebook groups and a posting schedule.`,
        ``,
        `AI is already switched on. Beginner includes 150 AI actions a month on our key, so you don't need an OpenAI account.`,
        ``,
        `The full guide (sign in first): ${BEGINNER_GUIDE_URL}`,
        ``,
        `Questions? Just reply. I read every one.`,
        ``,
        SIGNOFF,
      ].join("\n");
    },
  },
  "day0.power": {
    subject: "Welcome to Power User: OpenAI key, then book your 1:1",
    updatedAt: "2026-11-08",
    build: (vars) => {
      const v = pv(vars);
      const book = str(v.bookCallUrl) || BOOK_URL;
      return [
        `Hi ${v.firstName},`,
        ``,
        `Liz here, founder of Influencer Butler. Thanks for choosing Power User. Every butler is unlocked on your plan, and you're all set, no trial countdown.`,
        ``,
        `First, install the desktop app: ${DOWNLOAD_URL}`,
        ...INSTALL_LINES.map((l) => l.replace(/^ {5}/, "  ")),
        ``,
        `Then two things before anything else:`,
        `  1. Add your OpenAI key. Power User runs unlimited AI on your own key: you pay OpenAI directly for what you use (a few dollars a month for most creators), and a ChatGPT subscription does not work. Five-minute guide: ${OPENAI_SETUP_URL}`,
        `     Paste the key into AI & Data Keys in the app and click Test.`,
        `  2. Book your 1:1 with the team: ${book}`,
        `     Setup help, strategy, anything you'd rather talk through than type.`,
        ``,
        `When the walkthrough asks what you want to do first, pick your goal and it sets up just what that goal needs.`,
        ``,
        `The full guide (sign in first): ${POWER_GUIDE_URL}`,
        ``,
        `Questions? Just reply. I read every one.`,
        ``,
        SIGNOFF,
      ].join("\n");
    },
  },
  "day2.beginner": {
    subject: "Your fast track, in order",
    updatedAt: "2026-11-08",
    build: (vars) => {
      const v = pv(vars);
      return [
        `Hi ${v.firstName},`,
        ``,
        `If you've finished the fast track, here's what to do next, in this order:`,
        ``,
        `  1. Run Orders Butler so the app knows what you actually sell.`,
        `  2. Turn on Daily Commission Butler. ${DAILY_COMMISSION_LINE} Click Run once first for a preview. By default it skips campaigns under 5% commission and ones ending in less than 48 hours.`,
        `  3. Let Deal Posting run on its schedule, and check Posted Deals Log the next morning.`,
        `  4. If Amazon ever removes a video or photo, Video Reload and Photo Reload put it back up for you.`,
        ``,
        `Didn't finish the walkthrough? Rerun it any time from Settings: the First-run walkthrough card has Resume and Start over.`,
        ``,
        ...optionalLine(str(v.goalLine)),
        `Tutorials for every Beginner butler: ${BEGINNER_GUIDE_URL}`,
        ``,
        `Stuck anywhere? Reply and tell me where.`,
        ``,
        SIGNOFF,
      ].join("\n");
    },
  },
  "day2.power": {
    subject: "Pick your fast track by goal",
    updatedAt: "2026-11-08",
    build: (vars) => {
      const v = pv(vars);
      const book = str(v.bookCallUrl) || BOOK_URL;
      return [
        `Hi ${v.firstName},`,
        ``,
        `With every butler unlocked, the trick is not turning everything on at once. Pick one goal in the walkthrough and let it build the setup for that goal (skipped it? Open Settings and click Resume on the First-run walkthrough card):`,
        ``,
        `  - Post deals to groups I already run: Deal Posting, plus WAL Deals Finder if you work Walmart.`,
        `  - Auto-accept Creator Connections and SPCC campaigns: ${DAILY_COMMISSION_LINE}`,
        `  - Upload videos or photos to other marketplaces: re-post your US storefront videos and photos to Canada, the UK, Australia and Singapore.`,
        `  - I do a bit of everything: the full setup across all your platforms.`,
        ``,
        ...optionalLine(str(v.goalLine)),
        `Want a second pair of eyes on your setup? Book your 1:1: ${book}`,
        ``,
        `Tutorials for every butler: ${POWER_GUIDE_URL}`,
        ``,
        SIGNOFF,
      ].join("\n");
    },
  },
};

registerTrackCopy("pro", PRO_TRACK_COPY);

export type ProEmailPayload = {
  tier: ProTier;
  to: string;
  name: string;
  planName: string | null;
  subscriptionUrl: string;
  /** Funnels v2 content key (e.g. "day0.beginner", "day5.mod-walmart").
   * Omitted = the bare tier, exactly as before. */
  contentKey?: string;
  /** Track vars from funnel-personalize buildTrackVars; missing ones fall
   * back to defaultLifecycleTrackVars(). */
  trackVars?: Partial<LifecycleTrackVars>;
};

/** Renders the vars a Pro send uses (exported for tests and previews). */
export function proVarsFor(payload: Pick<ProEmailPayload, "name" | "planName" | "subscriptionUrl" | "trackVars">): ProVars {
  return {
    ...mergeTrackVars(payload.trackVars),
    firstName: payload.name.split(" ")[0] || "there",
    planName: payload.planName && payload.planName.trim().length > 0 ? payload.planName : "",
    subscriptionUrl: payload.subscriptionUrl,
  };
}

function proBare(vars: ProVars) {
  return (tier: string) => {
    const c = PRO_COPY[tier as ProTier];
    return c ? { subject: c.subject, body: c.build(vars) } : null;
  };
}

export async function sendProEmail(payload: ProEmailPayload): Promise<boolean> {
  const vars = proVarsFor(payload);
  const rec = vars as unknown as Record<string, unknown>;
  const overrides = await getFunnelOverrides();
  const resolved = resolveFunnelCopyForKey({
    funnel: "pro",
    contentKey: payload.contentKey || payload.tier,
    vars: rec,
    overrides,
    codeDefaultForKey: makeLocalCodeDefault("pro", proBare(vars), rec),
  });
  if (!resolved.subject || !resolved.body) {
    console.error("pro-emails: no copy resolved", { tier: payload.tier, contentKey: payload.contentKey });
    return false;
  }
  // Funnels v2 only: A/B overlay + step tracking.
  const sendCopy = payload.contentKey || payload.trackVars
    ? await withFunnelExperiment({
        funnel: "pro",
        contentKey: payload.contentKey || payload.tier,
        email: payload.to,
        control: { subject: resolved.subject, body: resolved.body },
        vars: rec,
      })
    : { subject: resolved.subject, body: resolved.body, tracking: {} };
  const ok = await sendMarketingEmail({
    from: FROM_ADDRESS,
    to: payload.to,
    subject: sendCopy.subject,
    text: sendCopy.body,
    category: `pro_${payload.tier}`,
    funnel: "pro",
    trackOpens: true,
    ...sendCopy.tracking,
  });
  if (ok && resolved.applyTag) {
    try {
      await tagRecipientsAsContacts(createAdminClient(), [payload.to], resolved.applyTag, "funnel:pro");
    } catch (err) {
      console.error("pro-emails: tag-on-send failed", err);
    }
  }
  return ok;
}
