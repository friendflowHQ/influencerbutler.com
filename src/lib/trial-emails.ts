// Free-trial conversion funnel - plain-text emails via Resend. Mirrors
// src/lib/conversion-emails.ts in style (direct fetch, no template library).
// Sent by the /api/cron/affiliate-funnel cron in its sendTrialEmails step.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { annualSavingsPct } from "@/lib/pricing-constants";
import { sendMarketingEmail } from "@/lib/marketing-email";

export type TrialTier = "day0" | "day1" | "day2" | "day3";

type TierCopy = {
  // Subject can depend on the vars (day3 drops the codes mention when the
  // user has no codes).
  subject: string | ((vars: TrialVars) => string);
  build: (vars: TrialVars) => string;
};

type TrialVars = {
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

const COPY: Record<TrialTier, TierCopy> = {
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
        `  3. Set up the Deals Influencer Butler to find deals in your niche and post them automatically.`,
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
  day2: {
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
  day3: {
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
        `Either way, your free-forever butlers (Like Butler, Benable Like Butler, CC Check, Orders Butler, Storefront Butler) and the whole Chrome extension keep working - no card, no expiry.`,
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
  const copy = COPY[payload.tier];
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

  return sendMarketingEmail({ from: FROM_ADDRESS, to: payload.to, subject, text: body });
}
