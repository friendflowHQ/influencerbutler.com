// Free-app onboarding drip - plain-text emails via Resend. Mirrors
// src/lib/trial-emails.ts in style (direct sendMarketingEmail, no template
// library). Sent by the /api/cron/affiliate-funnel cron in its
// sendFreeOnboardingEmails step.
//
// Audience: people who downloaded the free desktop app and left their email on
// the /downloading interstitial (email_subscribers rows with
// source = 'download-app'). They have NOT entered a card and have NOT started a
// paid trial - most never will unless we nurture them. This drip walks them
// from install -> first win -> the free-forever butlers -> a Pro upgrade.
//
// Deliberately soft on the sell: day0/day2 are pure activation help, day5
// introduces one Pro-only butler, day10 makes the upgrade ask with social proof
// and a first-timer discount. Every email keeps the free tier working so the
// relationship survives even if they never pay.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { getFunnelOverrides, resolveFunnelCopy } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";

export type OnboardingTier = "day0" | "day2" | "day5" | "day10";

export type OnboardingVars = {
  firstName: string;
  pricingUrl: string; // /pricing (optionally with a ?code= first-timer discount)
  helpUrl: string;
  extensionUrl: string;
  discountCode: string | null;
  discountPercent: number;
};

export type TierCopy = {
  subject: string | ((vars: OnboardingVars) => string);
  build: (vars: OnboardingVars) => string;
};

const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;

// The six free-forever butlers, kept in sync with entitlements.ts / trial day14.
const FREE_BUTLERS =
  "Like Butler, Benable Like Butler, Instagram Like Butler, CC Check, Orders Butler, and Storefront Butler";

export const ONBOARDING_COPY: Record<OnboardingTier, TierCopy> = {
  day0: {
    subject: "Your Influencer Butler setup guide (3 minutes)",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `Thanks for downloading Influencer Butler. Here is the 3-minute path to your first win:`,
        ``,
        `  1. Open the installer from your browser's downloads bar and finish setup.`,
        `     (Windows may show a "Windows protected your PC" screen - click More info, then Run anyway. That is normal for brand-new apps.)`,
        `  2. Log in to Amazon inside the app and run Orders Butler to sync your order history.`,
        `  3. Turn on Like Butler to auto-like the posts that keep your account active.`,
        ``,
        `All of that is on the free-forever plan: ${FREE_BUTLERS}. No card, no expiry.`,
        ``,
        `Prefer to start in your browser? The free Chrome extension works on every account: ${v.extensionUrl}`,
        ``,
        `Step-by-step tutorials for every butler: ${v.helpUrl}`,
        ``,
        `Questions? Just reply to this email - a real human answers.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n"),
  },
  day2: {
    subject: "The one butler to run first (it makes the rest smarter)",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `If you do just one thing this week, make it this: run Orders Butler and let it pull your real Amazon order history.`,
        ``,
        `Once it has your real numbers, every other butler gets sharper:`,
        `  1. Storefront Butler flags the products missing tags or videos, so you fix the ones that actually sell.`,
        `  2. CC Check shows which Creator Connections campaigns are worth your time.`,
        `  3. Like Butler and the Instagram/Benable like butlers keep your accounts warm in the background.`,
        ``,
        `These are all free forever - no card needed to see what they do.`,
        ``,
        `Tutorials: ${v.helpUrl}`,
        ``,
        `Stuck on anything? Reply and I will help you get it running.`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n"),
  },
  day5: {
    subject: "The part of Butler that runs while you sleep",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `The free butlers keep your accounts healthy. The Pro butlers are the ones that actually grow your commissions on autopilot:`,
        ``,
        `  1. Daily Commission Butler: auto-accepts the right Creator Connections campaigns based on what you sold yesterday.`,
        `  2. Deals Butler: finds deals in your niche and posts them across your platforms automatically.`,
        `  3. Messenger Butler: keeps your DMs answered so warm followers do not go cold.`,
        ``,
        `You can try all of them free for 14 days - every Pro butler unlocked. Start here: ${v.pricingUrl}`,
        ``,
        `Not ready? No problem. Your free butlers keep working with no card and no expiry.`,
        ``,
        `Tutorials: ${v.helpUrl}`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      ].join("\n"),
  },
  day10: {
    subject: (v) =>
      v.discountCode
        ? `A welcome gift: ${v.discountPercent}% off your first month`
        : "What other creators do with the Pro butlers",
    build: (v) => {
      const lines = [
        `Hi ${v.firstName},`,
        ``,
        `Creators who switch on the Pro butlers tell us the same thing: the campaigns and deal posts they used to do by hand now just happen, and the commissions follow.`,
        ``,
        `That is the whole idea - Butler does the busywork so you can focus on making content.`,
        ``,
      ];
      if (v.discountCode) {
        lines.push(
          `As a thank-you for trying the free app, here is ${v.discountPercent}% off your first month of Pro with code ${v.discountCode}. It is unique to you.`,
          ``,
          `Start your 14-day Pro trial and the code applies at checkout: ${v.pricingUrl}`,
          ``,
        );
      } else {
        lines.push(
          `Try every Pro butler free for 14 days: ${v.pricingUrl}`,
          ``,
        );
      }
      lines.push(
        `Either way, your free-forever butlers (${FREE_BUTLERS}) and the whole Chrome extension keep working - no card, no expiry.`,
        ``,
        `Read what other creators say: https://www.influencerbutler.com`,
        ``,
        `P.S. Enjoying the tools? You can earn a 30% recurring commission for a year on everyone you refer. Grab your link in two minutes: https://www.influencerbutler.com/affiliates`,
        ``,
        COMMUNITY_LINE,
        ``,
        `- The Influencer Butler team`,
      );
      return lines.join("\n");
    },
  },
};

export type OnboardingEmailPayload = {
  tier: OnboardingTier;
  to: string;
  name?: string | null;
  pricingUrl: string;
  helpUrl: string;
  extensionUrl: string;
  discountCode?: string | null;
  discountPercent?: number;
};

export async function sendOnboardingEmail(payload: OnboardingEmailPayload): Promise<boolean> {
  const copy = ONBOARDING_COPY[payload.tier];
  const firstName = (payload.name ?? "").split(" ")[0] || "there";

  const vars: OnboardingVars = {
    firstName,
    pricingUrl: payload.pricingUrl,
    helpUrl: payload.helpUrl,
    extensionUrl: payload.extensionUrl,
    discountCode: payload.discountCode ?? null,
    discountPercent: payload.discountPercent ?? 0,
  };
  const subject = typeof copy.subject === "function" ? copy.subject(vars) : copy.subject;
  const body = copy.build(vars);

  const overrides = await getFunnelOverrides();
  const resolved = resolveFunnelCopy({
    funnel: "onboarding",
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
    category: `onboarding_${payload.tier}`,
    funnel: "onboarding",
  });
  if (ok && resolved.applyTag) {
    try {
      await tagRecipientsAsContacts(createAdminClient(), [payload.to], resolved.applyTag, "funnel:onboarding");
    } catch (err) {
      console.error("free-onboarding-emails: tag-on-send failed", err);
    }
  }
  return ok;
}
