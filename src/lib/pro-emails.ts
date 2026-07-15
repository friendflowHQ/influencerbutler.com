// Direct-subscriber Pro welcome funnel - plain-text emails via Resend. Mirrors
// src/lib/trial-emails.ts in style (direct fetch, no template library). Sent by
// the /api/cron/affiliate-funnel cron in its sendProEmails step.
//
// These go to customers who subscribed straight to a paid Pro plan (Lemon
// Squeezy status 'active', no free trial). They must never receive the trial
// sequence ("your trial is live", "trial ends today"), so this is a separate
// track keyed off subscriptions.pro_started_at.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";

export type ProTier = "day0" | "day2" | "day5" | "day10";

type TierCopy = {
  subject: string;
  build: (vars: ProVars) => string;
};

type ProVars = {
  firstName: string;
  planName: string; // e.g. "Pro Solo" - falls back to "Influencer Butler Pro"
  subscriptionUrl: string;
};

const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";
const HELP_URL = "https://www.influencerbutler.com/help";
const AFFILIATE_URL = "https://www.influencerbutler.com/dashboard/affiliates";
// Chooser page so Mac recipients get the right build, not the Windows .exe.
const DOWNLOAD_URL = "https://www.influencerbutler.com/download";
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;

const COPY: Record<ProTier, TierCopy> = {
  day0: {
    subject: "You're in: welcome to Influencer Butler Pro",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `Thanks for subscribing to ${v.planName}. Your account is active and every automation tool is unlocked - no trial countdown, you're a full member from today.`,
        ``,
        `Three quick steps to get value today:`,
        `  1. Install the desktop app: ${DOWNLOAD_URL}`,
        `  2. Paste your license key (on your welcome page) into the app`,
        `  3. Log in to Amazon inside the app and run Orders Butler to sync your history`,
        ``,
        `Prefer to start in your browser? The free Chrome extension works on every account: https://www.influencerbutler.com/extension`,
        ``,
        `Manage your plan anytime: ${v.subscriptionUrl}`,
        ``,
        `Questions? Just reply to this email and a real human will answer.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day2: {
    subject: "3 things power users do first with Influencer Butler",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `Now that you're set up, here are the three moves that separate power users from everyone else:`,
        ``,
        `  1. Run Orders Butler to sync your real Amazon order history. It gives every other butler accurate signal on what you actually sell.`,
        `  2. Turn on Daily Commission Butler so it auto-accepts the right Creator Connections campaigns based on yesterday's sales.`,
        `  3. Set up the Deals Influencer Butler to find deals in your niche and post them automatically.`,
        ``,
        `Step-by-step tutorials for every butler: ${HELP_URL}`,
        ``,
        `Reply with any question - a real human will answer.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day5: {
    subject: "The feature most creators miss in their first week",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `Most new Pro members set up scheduling and stop there. The creators who earn the most turn on commission harvesting too.`,
        ``,
        `  - Connect your affiliate accounts once and Influencer Butler pulls your commissions and deep links automatically.`,
        `  - Your storefront stays current without manual relinking.`,
        `  - You spend your time creating, not chasing payouts.`,
        ``,
        `Walkthrough: ${HELP_URL}`,
        ``,
        `Manage your plan: ${v.subscriptionUrl}`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
  day10: {
    subject: "Earn 30% recurring by referring other creators",
    build: (v) => {
      return [
        `Hi ${v.firstName},`,
        ``,
        `You're a week and a half into Pro - how's it going? If there's anything we can help with, just reply.`,
        ``,
        `One thing worth knowing: your Pro plan includes our affiliate program. Refer another creator and earn 30% recurring (for 12 months) on everyone you bring in.`,
        ``,
        `Open your affiliate dashboard: ${AFFILIATE_URL}`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n");
    },
  },
};

export type ProEmailPayload = {
  tier: ProTier;
  to: string;
  name: string;
  planName: string | null;
  subscriptionUrl: string;
};

export async function sendProEmail(payload: ProEmailPayload): Promise<boolean> {
  const copy = COPY[payload.tier];
  const firstName = payload.name.split(" ")[0] || "there";

  const body = copy.build({
    firstName,
    planName: payload.planName && payload.planName.trim().length > 0 ? payload.planName : "Influencer Butler Pro",
    subscriptionUrl: payload.subscriptionUrl,
  });

  return sendMarketingEmail({ from: FROM_ADDRESS, to: payload.to, subject: copy.subject, text: body });
}
