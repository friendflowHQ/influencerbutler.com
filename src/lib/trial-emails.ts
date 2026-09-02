// Free-trial conversion funnel - plain-text emails via Resend. Mirrors
// src/lib/conversion-emails.ts in style (direct fetch, no template library).
// Sent by the /api/cron/affiliate-funnel cron in its sendTrialEmails step.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { annualSavingsPct } from "@/lib/pricing-constants";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { getFunnelOverrides, resolveFunnelCopy } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";

// 14-day trial nurture drip. Early touches (day0/1) are onboarding; day3 and
// day11 are personal founder notes (a check-in and a "3 days left" nudge); the
// last two (day13/day14) are the "24 hours left" and "ends tonight" urgency
// emails, timed to land just before the 14-day trial converts. See TRIAL_TIERS
// in /api/cron/affiliate-funnel/route.ts for the send schedule.
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
};

const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;

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
    subject: "Welcome to Influencer Butler: your Pro trial is live",
    build: (v) => {
      const url = monthlyCheckoutUrl(v.subscriptionUrl, v.monthlyCode);
      return [
        `Hi ${v.firstName},`,
        ``,
        `Welcome aboard - your 14-day Pro trial is active, with every one of the 40+ butlers unlocked.`,
        ``,
        `Three quick steps to get value today:`,
        `  1. Install the desktop app: https://www.influencerbutler.com/download`,
        `     (Heads up: Windows may show a "Windows protected your PC" screen. Click More info, then Run anyway. That is normal for brand-new apps.)`,
        `  2. Paste your license key (on your welcome page) into the app`,
        `  3. Log in to Amazon inside the app and run Orders Butler to sync your history`,
        ``,
        `Prefer to start in your browser? The free Chrome extension works on every account: https://www.influencerbutler.com/extension`,
        ``,
        v.monthlyCode
          ? `When your trial ends, use code ${v.monthlyCode} for ${v.monthlyPercent}% off your first month. It's unique to you and expires shortly after your trial.`
          : `We'll follow up with a discount code before your trial ends.`,
        ``,
        `Keep going: ${url}`,
        ``,
        `Questions? Just reply to this email.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day1: {
    subject: "Day 1 of your trial: three butlers to switch on today",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `You're one day into your 14-day Pro trial - here are the three fastest ways to see real results before it ends:`,
        ``,
        `  1. Run Orders Butler to sync your real Amazon order history. It gives every other butler accurate signal on what you actually sell.`,
        `  2. Turn on Daily Commission Butler so it auto-accepts the right Creator Connections campaigns based on yesterday's sales.`,
        `  3. Set up the Deals Butler to find deals in your niche and post them automatically.`,
        ``,
        `Step-by-step tutorials for every butler: https://www.influencerbutler.com/help`,
        ``,
        `Reply with any question - a real human will answer.`,
        ``,
        COMMUNITY_LINE,
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
    subject: "Halfway through your trial: the butlers most people keep",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `You're halfway through your 14-day trial, so here's what people tell us actually earns its place by now:`,
        ``,
        `  1. Daily Commission Butler: accepts the right Creator Connections campaigns in the background.`,
        `  2. Deals Butler: finds deals in your niche and posts them across your platforms automatically.`,
        `  3. Messenger Butler: keeps your DMs answered so warm followers don't go cold.`,
        ``,
        `If one of those isn't switched on yet, this is a good week to try it. You've still got a full week left to see what it does for your numbers.`,
        ``,
        `Tutorials: https://www.influencerbutler.com/help`,
        ``,
        `Reply any time. I read every email.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day11: {
    // A personal "3 days left" nudge from the founder, a few days before the
    // day13/day14 urgency emails. Warm, not salesy: reply-to-fix, not buy-now.
    subject: "3 days left on your Butler trial",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `Your 14-day Pro trial wraps up in about 3 days.`,
        ``,
        `If Butler has been earning its keep, you don't need to do a thing, it just continues. If it hasn't clicked yet, hit reply and tell me what's missing. I'd genuinely rather fix it than lose you.`,
        ``,
        `- Liz`,
      ].join("\n");
    },
  },
  day13: {
    subject: "24 hours left: switch to annual and save",
    build: (v) => {
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
      lines.push(
        ``,
        `Either way, your free-forever butlers (Like Butler, Benable Like Butler, Instagram Like Butler, CC Check, Orders Butler, Storefront Butler) and the whole Chrome extension keep working - no card, no expiry.`,
      );
      lines.push(``, COMMUNITY_LINE, ``, `- The Influencer Butler team`);
      return lines.join("\n");
    },
  },
};

export type TrialEmailPayload = {
  tier: TrialTier;
  to: string;
  name: string;
  monthlyCode: string | null;
  annualCode: string | null;
  monthlyPercent: number;
  annualPercent: number;
  subscriptionUrl: string;
};

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
  };
  const subject = typeof copy.subject === "function" ? copy.subject(vars) : copy.subject;
  const body = copy.build(vars);

  const overrides = await getFunnelOverrides();
  const resolved = resolveFunnelCopy({
    funnel: "trial",
    tier: payload.tier,
    vars: vars as unknown as Record<string, unknown>,
    defaults: { subject, body },
    overrides,
  });
  const ok = await sendMarketingEmail({
    from: FROM_ADDRESS,
    to: payload.to,
    subject: resolved.subject,
    text: resolved.body,
    category: `trial_${payload.tier}`,
    funnel: "trial",
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
