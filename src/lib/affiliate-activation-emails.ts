// Dormant-affiliate activation drip - plain-text emails via the marketing
// sender (suppression + unsubscribe honored). Sent by the
// /api/cron/affiliate-activation cron to approved affiliates who have not yet
// driven a single referred order.
//
// Two touches, anchored on the approval date (affiliate_applications.reviewed_at):
//   day7  - the swipe kit: their link + three copy-paste captions.
//   comp  - "we just put 30 days of Pro in your account, go get going" (or, when
//           they already have Pro, a "you're all set, here's how to earn" variant).
//
// Voice matches the affiliate resources email. No em dashes, no competitor names
// (repo copy rules). Signed personally from Liz, because founder mail gets read.

import { sendMarketingEmail } from "@/lib/marketing-email";
import { affiliateShareLink } from "@/lib/affiliate-resources-email";

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";

export type ActivationTier = "day7" | "comp";

/** The three ready-to-post captions, shared by both touches. */
function captionLines(shareLink: string): string[] {
  return [
    `1. "I automate my entire Amazon influencer workflow with Influencer Butler: finding deals, posting to my groups, and tracking what actually earns. It runs while I sleep. If you want to try it: ${shareLink}"`,
    ``,
    `2. "The thing that finally got my storefront posting consistent? Butler does the boring parts (deal hunting, captions, scheduling) so I just approve and go. Grab it here: ${shareLink}"`,
    ``,
    `3. "New favorite tool for Amazon influencers: Influencer Butler. It's like having an assistant for the busywork. Free extension to start, and here's my link if you want to check it out: ${shareLink}"`,
  ];
}

/** Day 7: the swipe-kit activation email. */
export function buildActivationDay7Email(vars: {
  firstName: string;
  code: string;
  hasCompQuota: boolean;
}): { subject: string; text: string } {
  const shareLink = affiliateShareLink(vars.code);
  const lines = [
    `Hi ${vars.firstName},`,
    ``,
    `Quick nudge, because you're set up as an Influencer Butler affiliate and I don't want you leaving money on the table.`,
    ``,
    `Two of our affiliates started posting this month and have already earned real commissions. You earn 30% of every payment, every month, for as long as your referral stays subscribed. One or two active subscribers can quietly cover your own plan and then some.`,
    ``,
    `Here's everything you need to post today. No thinking required.`,
    ``,
    `Your link: ${shareLink}`,
    ``,
    `Three captions you can copy-paste:`,
    ``,
    ...captionLines(shareLink),
    ``,
    `Assets: reply "send assets" and I'll shoot you screenshots and a 30-second demo clip you can drop straight into a Reel or Story.`,
    ``,
  ];
  if (vars.hasCompQuota) {
    lines.push(
      `Bonus: you can also gift your followers a free month of Pro from your dashboard. "Free trial from me" converts far better than "here's a link."`,
      ``,
    );
  }
  lines.push(`Post once this week and see what happens. I'm cheering you on.`, ``, `- Liz`);
  return {
    subject: "Your Butler link is ready (and 2 affiliates just got paid)",
    text: lines.join("\n"),
  };
}

/**
 * The comp-step email. When `alreadyPro` is false we just granted them a 30-day
 * comp (the key arrives in a separate license email from issueInHouseComp), so
 * this is the "why". When true, the grant was skipped because they already have
 * Pro, so we skip the gift language and point them straight at earning.
 */
export function buildActivationCompEmail(vars: {
  firstName: string;
  code: string;
  alreadyPro: boolean;
}): { subject: string; text: string } {
  const shareLink = affiliateShareLink(vars.code);

  if (vars.alreadyPro) {
    return {
      subject: "You've already got Pro, so let's get you earning",
      text: [
        `Hi ${vars.firstName},`,
        ``,
        `You've already got Influencer Butler Pro, so you're all set on the tool itself. The only thing left is the easy part: earning from it.`,
        ``,
        `You earn 30% of every payment, every month, for as long as each referral stays subscribed. Here's the 60-second way to start.`,
        ``,
        `Your link: ${shareLink}`,
        ``,
        `Pick one and post it today:`,
        ``,
        ...captionLines(shareLink),
        ``,
        `Reply if you want me to record a 30-second Loom of the fastest way in. I'm happy to.`,
        ``,
        `- Liz`,
      ].join("\n"),
    };
  }

  return {
    subject: "I just put 30 days of Pro in your account",
    text: [
      `Hi ${vars.firstName},`,
      ``,
      `You signed up to promote Influencer Butler and I don't want the tool itself to be the thing standing in your way. So I just switched on 30 days of Pro for you, free, no card, nothing to do. Your license key is in a separate email.`,
      ``,
      `Use it, see what it does for your own storefront, and the promoting gets easy, because you're recommending something you actually run.`,
      ``,
      `Your link is still ${shareLink}, and you earn 30% every month for every person who joins through it.`,
      ``,
      `When you're ready, pick one of these and post it:`,
      ``,
      ...captionLines(shareLink),
      ``,
      `Reply if you want me to record a 30-second Loom of the fastest way in.`,
      ``,
      `- Liz`,
    ].join("\n"),
  };
}

/** Send one activation email via the marketing sender (suppression honored). */
export async function sendAffiliateActivationEmail(params: {
  to: string;
  subject: string;
  text: string;
  tier: ActivationTier;
}): Promise<boolean> {
  return sendMarketingEmail({
    from: FROM_ADDRESS,
    to: params.to,
    subject: params.subject,
    text: params.text,
    category: params.tier === "day7" ? "affiliate_activation_day7" : "affiliate_activation_comp",
    funnel: "conversion",
  });
}
