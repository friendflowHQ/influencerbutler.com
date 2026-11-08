// Free-trial conversion funnel - plain-text emails via Resend. Mirrors
// src/lib/conversion-emails.ts in style (direct fetch, no template library).
// Sent by the /api/cron/affiliate-funnel cron in its sendTrialEmails step.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { annualSavingsPct } from "@/lib/pricing-constants";
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
  EXTENSION_URL,
  POWER_HELP_URL,
  SITE,
  firstNameOf,
  installNotes,
  paragraphs,
  trackVars,
} from "@/lib/funnel-modules";

// 14-day trial nurture drip. Early touches (day0/1) are onboarding; day3 and
// day11 are personal founder notes (a check-in and a "3 days left" nudge); the
// last two (day13/day14) are the "24 hours left" and "ends tonight" urgency
// emails, timed to land just before the 14-day trial converts. See TRIAL_TIERS
// in /api/cron/affiliate-funnel/route.ts for the send schedule.
//
// Funnels v2 (Nov 2026): TRIAL_COPY is the bare copy (unknown base, and the
// fallback for every tailored key). TRIAL_TRACK_COPY adds Beginner / Power
// User day0 emails; module slots (day1, day7) come from funnel-modules.ts.
// Prices and the price-lock line come from track vars, never literals.
export type TrialTier = "day0" | "day1" | "day3" | "day7" | "day11" | "day13" | "day14";

export type TierCopy = {
  // Subject can depend on the vars (day3 drops the codes mention when the
  // user has no codes).
  subject: string | ((vars: TrialVars) => string);
  build: (vars: TrialVars) => string;
};

export type TrialVars = {
  firstName: string;
  monthlyCode: string | null;
  annualCode: string | null;
  monthlyPercent: number;
  annualPercent: number;
  subscriptionUrl: string; // link with ?code= prefill
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

const FROM_ADDRESS = lifecycleFrom();
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;

const FREE_BUTLERS =
  "Like Butler, Benable Like Butler, Instagram Like Butler, CC Check, Orders Butler, Storefront Butler";

function asVars(v: TrialVars | TrackCopyVars): TrackCopyVars {
  return v as unknown as TrackCopyVars;
}

/** The three setup steps every trial welcome shares, with both OS notes. */
function setupSteps(): string[] {
  return [
    `  1. Download the desktop app: ${DOWNLOAD_URL}`,
    ...installNotes().map((l) => `   ${l}`),
    `  2. Paste your license key (on your welcome page) into the app.`,
    `  3. Sign in to Amazon inside the app and run Orders Butler to sync your history.`,
  ];
}

function codeLine(v: TrialVars | TrackCopyVars): string {
  const code = (v as TrialVars).monthlyCode;
  return code
    ? `When your trial ends, use code ${code} for ${(v as TrialVars).monthlyPercent}% off your first month. It's unique to you and expires shortly after your trial.`
    : `We'll follow up with a discount code before your trial ends.`;
}

const TIMING_NOTE = `Quick heads-up on timing: that first run only takes a couple of minutes, but setting up everything end to end (storefront, Creator Connections, every butler you want running) is more like a 30-90 minute project you do once, mostly hands-off. No need to rush it in one sitting.`;

function monthlyCheckoutUrl(base: string, code: string | null): string {
  if (!code) return base;
  return `${base}?code=${encodeURIComponent(code)}`;
}

function annualCheckoutUrl(base: string, code: string | null): string {
  if (!code) return base;
  return `${base}?code=${encodeURIComponent(code)}&plan=annual`;
}

export const TRIAL_COPY: Record<TrialTier, TierCopy> = {
  day0: {
    subject: "Welcome to Influencer Butler: your trial is live",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      const url = monthlyCheckoutUrl(v.subscriptionUrl, v.monthlyCode);
      return paragraphs(
        `Hi ${v.firstName},`,
        `Welcome aboard - your 14-day trial is active.`,
        `Three quick steps to get value today:`,
        setupSteps(),
        TIMING_NOTE,
        `Prefer to start in your browser? The free Chrome extension works on every account: ${EXTENSION_URL}`,
        t.aiLine,
        codeLine(v),
        `Keep going: ${url}`,
        `Questions? Just reply to this email.`,
        COMMUNITY_LINE,
        `- The Influencer Butler team`,
      );
    },
  },
  day1: {
    // One concrete win, not a menu. The old three-butler list had the lowest
    // open rate in the day 0-3 drip and zero clicks over 90 days (Oct 2026),
    // so this asks for a single five-minute action: a Daily Commission Butler
    // dry run that shows money already sitting on products the user sells.
    // No OpenAI key needed, and "Run once" previews without accepting anything.
    // Funnels v2: people with a walkthrough module get module copy here.
    subject: "the bonus commissions you haven't claimed yet",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `One thing to try today. It takes about five minutes.`,
        ``,
        `Amazon runs Creator Connections campaigns that pay a bonus commission on top of your normal rate. Plenty of them are on products you already sell, and they pay nothing unless you accept them.`,
        ``,
        `Daily Commission Butler finds and accepts them for you:`,
        ``,
        `  1. In the desktop app, run CC Check so the campaign list is fresh.`,
        `  2. Open Daily Commission Butler and click Run once.`,
        `  3. Look at the list. These are campaigns on products you sold recently or that top your storefront. Run once only previews, nothing is accepted until you click Accept all.`,
        ``,
        `If the list looks right, accept them and switch on the daily schedule. From then on it claims new matches once a day without you.`,
        ``,
        `Full walkthrough: https://www.influencerbutler.com/help/tutorials/dailycommissionbutler`,
        ``,
        `Empty list? Usually Orders Butler hasn't synced yet. Run it once and try again. Haven't set up the app yet? Get it here: ${DOWNLOAD_URL}`,
        ...installNotes(),
        ``,
        `Reply and tell me how many it found. A real human reads every reply.`,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day3: {
    // A personal founder note, not a feature list. Short, human, reply-inviting:
    // day-3 check-ins from the founder get answered and shape the roadmap.
    subject: "quick question about your Butler trial",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `Liz here, founder of Influencer Butler. No pitch, I promise.`,
        ``,
        `I just want to know one thing: what were you hoping Butler would do for you when you started your trial?`,
        ``,
        `Whatever you say, I read every reply myself and it shapes what we build next. And if something is already in your way, tell me and I'll personally help you get it working.`,
        ``,
        `- Liz`,
      ].join("\n");
    },
  },
  day7: {
    // Funnels v2: people with a second walkthrough module get module copy here.
    subject: "Halfway through your trial: the butlers most people keep",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `Hi ${v.firstName},`,
        `You're halfway through your 14-day trial, so here's what people tell us actually earns its place by now:`,
        [
          `  1. Daily Commission Butler: accepts the matching Creator Connections campaigns once a day, so the bonus commissions on products you already sell stop slipping by.`,
          `  2. Deal Posting (formerly Deals Influencer Butler): finds deals from your keywords and posts them to your Facebook groups and pages on a schedule.`,
          `  3. The free Chrome extension: scores every Creator Connections campaign card and shows what each of your videos earned, right on Amazon's pages: ${EXTENSION_URL}`,
        ],
        `If one of those isn't switched on yet, this is a good week to try it. You've still got a full week left to see what it does for your numbers.`,
        t.eventLine,
        `Tutorials: ${SITE}/help`,
        `Reply any time. I read every email.`,
        COMMUNITY_LINE,
        `- The Influencer Butler team`,
      );
    },
  },
  day11: {
    // A personal "3 days left" nudge from the founder, a few days before the
    // day13/day14 urgency emails. Warm, not salesy: reply-to-fix, not buy-now.
    subject: "3 days left on your Butler trial",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      return paragraphs(
        `Hi ${v.firstName},`,
        `Your 14-day trial wraps up in about 3 days.`,
        `If Butler has been earning its keep, you don't need to do a thing, it just continues.`,
        t.priceLockLine,
        `If it hasn't clicked yet, hit reply and tell me what's missing. I'd genuinely rather fix it than lose you.`,
        `- Liz`,
      );
    },
  },
  day13: {
    subject: (v) =>
      trackVars(asVars(v), "unknown").priceLockLine
        ? "24 hours left: lock today's price on annual"
        : "24 hours left: switch to annual and save",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      const url = annualCheckoutUrl(v.subscriptionUrl, v.annualCode);
      const annualBase = annualSavingsPct("solo");
      const lines = [
        `Hi ${v.firstName},`,
        ``,
        `Quick heads-up: your trial ends in about 24 hours.`,
        ``,
      ];
      if (v.annualCode) {
        lines.push(
          `If you're ready to commit, annual already costs ${annualBase}% less than paying monthly. Use code ${v.annualCode} for an extra ${v.annualPercent}% off annual on top: the biggest discount we offer.`,
          ``,
          `This code is unique to you, works only on the annual plan, and expires with your trial.`,
        );
      } else {
        lines.push(
          `Annual already costs ${annualBase}% less than paying monthly if you're ready to commit.`,
        );
      }
      if (t.priceLockLine) lines.push(``, t.priceLockLine);
      lines.push(``, `Lock it in: ${url}`, ``);
      if (v.monthlyCode) {
        lines.push(`Not ready for annual? Your ${v.monthlyPercent}% off monthly code still works.`, ``);
      }
      lines.push(
        `Not for you? No hard feelings - cancel in one click from your dashboard before your trial ends and you won't be billed: ${v.subscriptionUrl}`,
        ``,
      );
      lines.push(COMMUNITY_LINE, ``, `- The Influencer Butler team`);
      return lines.join("\n");
    },
  },
  day14: {
    subject: (v) =>
      v.monthlyCode || v.annualCode
        ? "Your trial ends today: your discount codes expire at midnight"
        : "Your trial ends today",
    build: (v) => {
      const t = trackVars(asVars(v), "unknown");
      const monthlyUrl = monthlyCheckoutUrl(v.subscriptionUrl, v.monthlyCode);
      const annualUrl = annualCheckoutUrl(v.subscriptionUrl, v.annualCode);
      const hasBoth = Boolean(v.monthlyCode && v.annualCode);
      const hasAny = Boolean(v.monthlyCode || v.annualCode);

      const lines = [`Hi ${v.firstName},`, ``];
      if (hasAny) {
        lines.push(`Last call - your trial ends tonight, and so do your personal discount codes.`, ``);
        if (v.monthlyCode) {
          lines.push(`• ${v.monthlyPercent}% off monthly: ${v.monthlyCode}`);
        }
        if (v.annualCode) {
          lines.push(`• ${v.annualPercent}% off annual: ${v.annualCode}`);
        }
        lines.push(``);
      } else {
        lines.push(`Last call - your trial ends tonight.`, ``);
      }
      if (v.annualCode) {
        lines.push(`Monthly: ${monthlyUrl}`, `Annual (best value): ${annualUrl}`);
      } else {
        lines.push(`Continue: ${monthlyUrl}`);
      }
      lines.push(``);
      if (hasBoth) {
        lines.push(`Both codes are single-use and locked to your account. After tonight, regular pricing applies.`);
      } else if (hasAny) {
        lines.push(`Your code is single-use and locked to your account. After tonight, regular pricing applies.`);
      } else {
        lines.push(`After tonight, regular pricing applies.`);
      }
      if (t.priceLockLine) lines.push(``, t.priceLockLine);
      lines.push(
        ``,
        `Either way, your free-forever butlers (${FREE_BUTLERS}) and the whole Chrome extension keep working - no card, no expiry.`,
      );
      lines.push(``, COMMUNITY_LINE, ``, `- The Influencer Butler team`);
      return lines.join("\n");
    },
  },
};

// ---------------------------------------------------------------------------
// Track copy (per base), registered in the Funnels v2 registry
// ---------------------------------------------------------------------------

const UPDATED = "2026-11-08";

function trialCheckoutUrl(v: TrackCopyVars): string {
  const base = String(v.subscriptionUrl ?? `${SITE}/pricing`);
  const code = typeof v.monthlyCode === "string" && v.monthlyCode ? v.monthlyCode : null;
  return monthlyCheckoutUrl(base, code);
}

export const TRIAL_TRACK_COPY: TrackCopyMap = {
  "day0.beginner": {
    subject: "Your Beginner trial is live: AI included",
    updatedAt: UPDATED,
    build: (v) => {
      return paragraphs(
        `Hi ${firstNameOf(v)},`,
        `Liz here, founder of Influencer Butler. Your 14-day Beginner trial is active, and I'm so glad you're here.`,
        `Beginner gives you the butlers that earn first, without 50 menus to wade through: Deal Posting, brand outreach, Daily Commission Butler, Video and Photo Reload and your Foyer page, plus every free tool.`,
        AI_LINES.beginner,
        `Three quick steps to get value today:`,
        setupSteps(),
        `The first time you open the app, pick "Start with the basics (Beginner plan)" in the walkthrough. In about ten minutes it connects your marketplaces and Storefront IDs and your Creator API credentials, scans your storefront, adds the Chrome extension, then hands you to Deals quick setup.`,
        TIMING_NOTE,
        `Everything about your plan: ${BEGINNER_HELP_URL}`,
        codeLine(v),
        `Keep going: ${trialCheckoutUrl(v)}`,
        `Questions? Just reply. I read every email.`,
        COMMUNITY_LINE,
        `- Liz`,
      );
    },
  },
  "day0.power": {
    subject: (v) =>
      String(v.bookCallUrl ?? "").trim()
        ? "Your Power User trial is live: book your 1:1"
        : "Your Power User trial is live: one key, then one butler",
    updatedAt: UPDATED,
    build: (v) => {
      const t = trackVars(v, "power");
      return paragraphs(
        `Hi ${firstNameOf(v)},`,
        `Liz here, founder of Influencer Butler. Your 14-day Power User trial is active: every butler, unlimited AI on your own key, and direct access to the team.`,
        t.bookCallUrl
          ? `First, the perk most people forget: Power User includes 1:1 calls with the team. Grab a time now and we'll set things up with you: ${t.bookCallUrl}`
          : null,
        `Three quick steps to get value today:`,
        setupSteps(),
        `Then add your OpenAI key: open AI & Data Keys in the left menu, paste it and click Test. ${AI_LINES.power}`,
        `Once that's in, run Daily Commission Butler (click Run once to preview). It reads what you sold recently and your storefront best-sellers, then accepts the matching Creator Connections campaigns once a day.`,
        TIMING_NOTE,
        `Everything about your plan: ${POWER_HELP_URL}`,
        codeLine(v),
        `Keep going: ${trialCheckoutUrl(v)}`,
        COMMUNITY_LINE,
        `- Liz`,
      );
    },
  },
};

registerTrackCopy("trial", TRIAL_TRACK_COPY);

export type TrialEmailPayload = {
  tier: TrialTier;
  to: string;
  name: string;
  monthlyCode: string | null;
  annualCode: string | null;
  monthlyPercent: number;
  annualPercent: number;
  subscriptionUrl: string;
  /** Funnels v2: the content key the send path chose ("day1.mod-walmart").
   * Omitted (or FUNNELS_V2 off) = bare tier, exactly the old behavior. */
  contentKey?: string;
  /** Funnels v2 track vars from funnel-personalize buildTrackVars. */
  trackVars?: Partial<
    Pick<TrialVars, "aiLine" | "priceLockLine" | "price" | "beginnerPrice" | "eventLine" | "goalLine" | "bookCallUrl">
  >;
};

function renderTier(copy: TierCopy, vars: TrialVars): { subject: string; body: string } {
  const subject = typeof copy.subject === "function" ? copy.subject(vars) : copy.subject;
  return { subject, body: copy.build(vars) };
}

/** Code copy for exactly `key` in the trial funnel: the bare tier's copy, or
 * tailored registry copy (track or module), else null. Same contract as
 * system-funnels makeCodeDefaultForKey, without importing it (cycle). */
export function trialCodeDefaultForKey(key: string, vars: TrialVars): { subject: string; body: string } | null {
  const p = parseContentKey(key);
  if (!p) return null;
  if (!p.base && !p.module) {
    const copy = TRIAL_COPY[p.tier as TrialTier];
    return copy ? renderTier(copy, vars) : null;
  }
  const entry = lookupTrackCopy("trial", key);
  if (!entry) return null;
  const tv = asVars(vars);
  const subject = typeof entry.subject === "function" ? entry.subject(tv) : entry.subject;
  return { subject, body: entry.build(tv) };
}

export async function sendTrialEmail(payload: TrialEmailPayload): Promise<boolean> {
  const copy = TRIAL_COPY[payload.tier];
  const firstName = payload.name.split(" ")[0] || "there";

  const vars: TrialVars = {
    firstName,
    monthlyCode: payload.monthlyCode,
    annualCode: payload.annualCode,
    monthlyPercent: payload.monthlyPercent,
    annualPercent: payload.annualPercent,
    subscriptionUrl: payload.subscriptionUrl,
    ...(payload.trackVars ?? {}),
  };

  const overrides = await getFunnelOverrides();
  const key = payload.contentKey && parseContentKey(payload.contentKey) ? payload.contentKey : null;
  const resolved = key
    ? resolveFunnelCopyForKey({
        funnel: "trial",
        contentKey: key,
        vars: asVars(vars),
        overrides,
        codeDefaultForKey: (k) => trialCodeDefaultForKey(k, vars),
      })
    : resolveFunnelCopy({
        funnel: "trial",
        tier: payload.tier,
        vars: asVars(vars),
        defaults: renderTier(copy, vars),
        overrides,
      });
  // Funnels v2 only (content key supplied): A/B overlay + step tracking.
  const sendCopy = key
    ? await withFunnelExperiment({
        funnel: "trial",
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
    category: `trial_${payload.tier}`,
    funnel: "trial",
    trackOpens: true,
    ...sendCopy.tracking,
  });
  if (ok && resolved.applyTag) {
    try {
      await tagRecipientsAsContacts(createAdminClient(), [payload.to], resolved.applyTag, "funnel:trial");
    } catch (err) {
      console.error("trial-emails: tag-on-send failed", err);
    }
  }
  return ok;
}
