// Free-app onboarding drip - plain-text emails via Resend. Mirrors
// src/lib/trial-emails.ts in style (direct sendMarketingEmail, no template
// library). Sent by the /api/cron/affiliate-funnel cron in its
// sendFreeOnboardingEmails step.
//
// Audience: people who downloaded the free desktop app and left their email on
// the /downloading interstitial (email_subscribers rows with
// source = 'download-app'). They have NOT entered a card and have NOT started a
// paid trial - most never will unless we nurture them. This drip walks them
// from install -> first win -> the free-forever butlers -> a paid plan.
//
// Deliberately soft on the sell: day0 is the Windows + Mac setup guide, day2
// and day5 are module slots (module copy lives in funnel-modules.ts, framed for
// the free tier; the bare copy below is the fallback), and day10 makes the
// "try Beginner or Power User free for 14 days" ask with an optional
// first-timer discount. Every email keeps the free tier working so the
// relationship survives even if they never pay. Prices only come from track
// vars / pricing-constants, never literals.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { withFunnelExperiment } from "@/lib/funnel-experiment-send";
import { lifecycleFrom } from "@/lib/email-senders";
import { getFunnelOverrides, resolveFunnelCopyForKey } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DAILY_COMMISSION_LINE,
  DOWNLOAD_URL,
  makeLocalCodeDefault,
  mergeTrackVars,
  str,
  type LifecycleTrackVars,
} from "@/lib/pro-emails";

export type OnboardingTier = "day0" | "day2" | "day5" | "day10";

export type OnboardingVars = {
  firstName: string;
  pricingUrl: string; // /pricing (optionally with a ?code= first-timer discount)
  helpUrl: string;
  extensionUrl: string;
  discountCode: string | null;
  discountPercent: number;
} & Partial<LifecycleTrackVars>;

export type TierCopy = {
  subject: string | ((vars: OnboardingVars) => string);
  build: (vars: OnboardingVars) => string;
};

const FROM_ADDRESS = lifecycleFrom();
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;
const SIGNOFF = "- Liz";

// The six free-forever butlers, kept in sync with entitlements.ts / trial day14.
const FREE_BUTLERS =
  "Like Butler, Benable Like Butler, Instagram Like Butler, CC Check, Orders Butler, and Storefront Butler";

function optionalLine(line: unknown): string[] {
  const s = str(line);
  return s.trim() ? [s, ``] : [];
}

/** " (from $24.99/month)", or "" when the var is blank. */
function fromPrice(label: unknown): string {
  const s = str(label);
  return s ? ` (from ${s})` : "";
}

export const ONBOARDING_COPY: Record<OnboardingTier, TierCopy> = {
  day0: {
    subject: "Your setup guide (Windows and Mac, 3 minutes)",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `Liz here, founder of Influencer Butler. Thanks for downloading the app. Here is the 3-minute path to your first win:`,
        ``,
        `  1. Open the download from your browser's downloads and install it.`,
        `     On Windows: run the installer. If you see "Windows protected your PC", click More info, then Run anyway. That is normal for new apps.`,
        `     On Mac: open the .dmg, drag Influencer Butler into Applications and open it from there. If macOS hesitates, right-click the app and choose Open.`,
        `     Need the download again, or the other version? ${DOWNLOAD_URL}`,
        `  2. Log in to Amazon inside the app and run Orders Butler to sync your order history.`,
        `  3. Turn on Like Butler to auto-like the posts that keep your account active.`,
        ``,
        `All of that is on the free-forever plan: ${FREE_BUTLERS}. No card, no expiry.`,
        ``,
        `Those 3 steps really are about 3 minutes. If you later add more butlers, budget more like 30-90 minutes for the full setup, mostly hands-off. No rush either way.`,
        ``,
        `Prefer to start in your browser? The free Chrome extension works on every account: ${v.extensionUrl}`,
        ``,
        `Step-by-step tutorials for every butler: ${v.helpUrl}`,
        ``,
        `Questions? Just reply. I read every one.`,
        ``,
        COMMUNITY_LINE,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
  // Module slot A fallback.
  day2: {
    subject: "The one butler to run first (it makes the rest smarter)",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `If you do just one thing this week, make it this: run Orders Butler and let it pull your real Amazon order history.`,
        ``,
        `Once it has your real numbers, the other free butlers get sharper:`,
        `  1. Storefront Butler flags the products missing tags or videos, so you fix the ones that actually sell.`,
        `  2. CC Check shows which Creator Connections campaigns are worth your time.`,
        `  3. Like Butler and the Instagram and Benable Like Butlers keep your accounts warm in the background.`,
        ``,
        `These are all free forever. No card needed to see what they do.`,
        ``,
        `Tutorials: ${v.helpUrl}`,
        ``,
        `Stuck on anything? Reply and I will help you get it running.`,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
  // Module slot B fallback.
  day5: {
    subject: "The part of Butler that works while you're logged off",
    build: (v) =>
      [
        `Hi ${v.firstName},`,
        ``,
        `The free butlers keep your accounts healthy. The paid plans add the butlers that grow your commissions on autopilot, and there are two to pick from:`,
        ``,
        `  Beginner${fromPrice(v.beginnerPrice)}: the starter butlers, with AI included.`,
        `    - ${DAILY_COMMISSION_LINE}`,
        `    - Deal Posting (formerly Deals Influencer Butler) finds deals from your keywords and posts them to your Facebook groups and pages on a schedule.`,
        `    - Video Reload and Photo Reload put back content Amazon removed.`,
        ``,
        `  Power User${fromPrice(v.price)}: every butler, including Walmart Butler, Social Posting Butler, YouTube Butler and Messenger Butler for your Creator Connections inbox, plus unlimited AI on your own OpenAI key and 1:1 calls with the team.`,
        ``,
        `It all runs on your own computer, or a cloud PC you set up yourself, using your own connection the whole time.`,
        ``,
        `You can try either one free for 14 days: ${v.pricingUrl}`,
        ``,
        `Not ready? No problem. Your free butlers keep working with no card and no expiry.`,
        ``,
        SIGNOFF,
      ].join("\n"),
  },
  day10: {
    subject: (v) =>
      v.discountCode
        ? `Try Beginner or Power User free for 14 days (plus ${v.discountPercent}% off)`
        : "Try Beginner or Power User free for 14 days",
    build: (v) => {
      const lines = [
        `Hi ${v.firstName},`,
        ``,
        `You've had the free app for about ten days. If you want Butler to start doing the money work too, both paid plans come with a 14-day free trial:`,
        ``,
        `  - Beginner${fromPrice(v.beginnerPrice)}: new to Influencer Butler or the Amazon Influencer Program? Start here. AI is included, and a guided fast track sets everything up in order.`,
        `  - Power User${fromPrice(v.price)}: every butler, unlimited AI on your own OpenAI key, and 1:1 calls with the team.`,
        ``,
        `Not sure? Start on Beginner. You can move up to Power User in one click any time, and your settings come with you.`,
        ``,
        ...optionalLine(v.priceLockLine),
      ];
      if (v.discountCode) {
        lines.push(
          `As a thank-you for trying the free app, here is ${v.discountPercent}% off your first month with code ${v.discountCode}. It is unique to you.`,
          ``,
          `Start your trial and the code applies at checkout: ${v.pricingUrl}`,
          ``,
        );
      } else {
        lines.push(`Pick a plan and start your trial: ${v.pricingUrl}`, ``);
      }
      lines.push(
        `Either way, your free-forever butlers (${FREE_BUTLERS}) and the whole Chrome extension keep working, no card, no expiry.`,
        ``,
        `P.S. Enjoying the tools? Our affiliate program pays 30% of every subscription you refer for its first 12 months. Details: https://www.influencerbutler.com/affiliates`,
        ``,
        COMMUNITY_LINE,
        ``,
        SIGNOFF,
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
  /** Funnels v2 content key (e.g. "day2.mod-walmart"). Omitted = bare tier. */
  contentKey?: string;
  /** Track vars from funnel-personalize; missing ones use the defaults. */
  trackVars?: Partial<LifecycleTrackVars>;
};

/** The vars an onboarding send renders with (exported for tests). */
export function onboardingVarsFor(payload: OnboardingEmailPayload): OnboardingVars {
  return {
    ...mergeTrackVars(payload.trackVars),
    firstName: (payload.name ?? "").split(" ")[0] || "there",
    pricingUrl: payload.pricingUrl,
    helpUrl: payload.helpUrl,
    extensionUrl: payload.extensionUrl,
    discountCode: payload.discountCode ?? null,
    discountPercent: payload.discountPercent ?? 0,
  };
}

function onboardingBare(vars: OnboardingVars) {
  return (tier: string) => {
    const c = ONBOARDING_COPY[tier as OnboardingTier];
    if (!c) return null;
    const subject = typeof c.subject === "function" ? c.subject(vars) : c.subject;
    return { subject, body: c.build(vars) };
  };
}

export async function sendOnboardingEmail(payload: OnboardingEmailPayload): Promise<boolean> {
  const vars = onboardingVarsFor(payload);
  const rec = vars as unknown as Record<string, unknown>;
  const overrides = await getFunnelOverrides();
  const resolved = resolveFunnelCopyForKey({
    funnel: "onboarding",
    contentKey: payload.contentKey || payload.tier,
    vars: rec,
    overrides,
    codeDefaultForKey: makeLocalCodeDefault("onboarding", onboardingBare(vars), rec),
  });
  if (!resolved.subject || !resolved.body) {
    console.error("free-onboarding-emails: no copy resolved", { tier: payload.tier, contentKey: payload.contentKey });
    return false;
  }
  // Funnels v2 only: A/B overlay + step tracking.
  const sendCopy = payload.contentKey || payload.trackVars
    ? await withFunnelExperiment({
        funnel: "onboarding",
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
    category: `onboarding_${payload.tier}`,
    funnel: "onboarding",
    trackOpens: true,
    ...sendCopy.tracking,
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
