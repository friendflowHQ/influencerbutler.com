// Affiliate conversion funnel: nudges newly approved affiliates to become paying
// customers, with escalating first-month offers (20% at 1 hour, 30% on day 3,
// 50% on day 5). Plain text, sent through sendMarketingEmail.
//
// Funnels v2 angles: Beginner is the cheap way to learn the product well
// enough to demo it, and day 3 is a "which plan should your audience pick"
// cheat sheet. Prices only come from track vars / pricing-constants.
// Affiliate terms match affiliate-commissions.ts defaults: 30% recurring for
// the first 12 months of each referred subscription (never "lifetime").

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { withFunnelExperiment } from "@/lib/funnel-experiment-send";
import { getFunnelOverrides, resolveFunnelCopyForKey } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeLocalCodeDefault, mergeTrackVars, str, type LifecycleTrackVars } from "@/lib/pro-emails";

export type ConversionTier = "1h" | "3d" | "5d";

type PlanPrices = Pick<LifecycleTrackVars, "price" | "beginnerPrice"> & Partial<LifecycleTrackVars>;

type TierCopy = {
  subject: string;
  leadLine: string;
  offerLine: string;
  /** Plan angle for this step, built from the track vars. */
  planLines: (t: PlanPrices) => string[];
  finalSell: string;
};

function from(label: string): string {
  return label ? ` (from ${label})` : "";
}

export const CONVERSION_COPY: Record<ConversionTier, TierCopy> = {
  "1h": {
    subject: "A little welcome gift: 20% off your first month",
    leadLine:
      "Liz here. Since you're now part of the Influencer Butler affiliate program, I'd love to have you on the inside as a customer too.",
    offerLine: "Use code {CODE} at checkout for 20% off your first month.",
    planLines: (t) => [
      `You don't need the biggest plan to demo it well. Beginner${from(t.beginnerPrice)} has the butlers most creators start with, AI included, so you can show your audience real results on your own account. Power User${from(t.price)} unlocks every butler.`,
    ],
    finalSell:
      "Knowing the product firsthand makes your referrals way more convincing, and you keep 30% recurring on everyone you bring in, for the first 12 months of each subscription.",
  },
  "3d": {
    subject: "Which plan should your audience pick? Here's 30% off to see for yourself",
    leadLine:
      "Quick one. The question affiliates get most is \"which plan should I start on?\", so here's the cheat sheet I'd use:",
    offerLine: "Use code {CODE} at checkout for 30% off your first month, so you can try it yourself first.",
    planLines: (t) => [
      `  - Free: the Chrome extension and the free-forever butlers. Good for anyone who just wants to look around.`,
      `  - Beginner${from(t.beginnerPrice)}: new to Influencer Butler or the Amazon Influencer Program. AI included, and a guided fast track sets it up in order.`,
      `  - Power User${from(t.price)}: creators who want every butler (Walmart, Social Posting, YouTube, Messenger for the Creator Connections inbox), unlimited AI on their own OpenAI key and 1:1 calls with the team.`,
      ``,
      `Not sure? Beginner, then one click up to Power User when they're ready. Both start with a 14-day free trial.`,
    ],
    finalSell:
      "Using the product makes every pitch to your audience land harder. And 30% commission on each referral, paid for the first 12 months, stacks fast.",
  },
  "5d": {
    subject: "Final offer: 50% off your first month (one-time code)",
    leadLine:
      "Last one from me. We generated a single-use code just for you, and after this we won't keep nudging.",
    offerLine: "Use code {CODE} at checkout for 50% off your first month.",
    planLines: (t) => [
      `Whichever plan you pick, Beginner${from(t.beginnerPrice)} or Power User${from(t.price)}, you get the Pro Lounge, our members' community inside the app, where you'll see what's working for other creators first.`,
    ],
    finalSell:
      "This code is locked to your account and only works once. After that, regular pricing applies. Good luck either way, and thanks for repping Influencer Butler.",
  },
};

export function conversionSubject(tier: ConversionTier): string {
  return CONVERSION_COPY[tier].subject;
}

/** Body for one step. `track` is optional so existing 4-arg callers (and the
 * admin preview) render with the constants-driven default prices. */
export function buildConversionBody(
  tier: ConversionTier,
  firstName: string,
  code: string,
  checkoutUrl: string,
  track?: Partial<LifecycleTrackVars> | null,
): string {
  const copy = CONVERSION_COPY[tier];
  const t = mergeTrackVars(track);
  const lock = str(t.priceLockLine);
  return [
    `Hi ${firstName},`,
    ``,
    copy.leadLine,
    ``,
    ...copy.planLines(t),
    ``,
    copy.offerLine.replace("{CODE}", code),
    ``,
    `Grab it here: ${checkoutUrl}`,
    ``,
    ...(lock ? [lock, ``] : []),
    copy.finalSell,
    ``,
    `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`,
    ``,
    `- Liz`,
  ].join("\n");
}

export async function sendConversionEmail(params: {
  tier: ConversionTier;
  to: string;
  name: string;
  code: string;
  checkoutUrl?: string;
  /** Funnels v2 track vars; missing ones use the constants-driven defaults. */
  trackVars?: Partial<LifecycleTrackVars>;
  /** Funnels v2 content key. Conversion steps are bare-only, so normally omitted. */
  contentKey?: string;
}): Promise<boolean> {
  const firstName = params.name.split(" ")[0] || "there";
  const checkoutUrl =
    params.checkoutUrl ??
    `https://www.influencerbutler.com/pricing?code=${encodeURIComponent(params.code)}`;

  const vars: Record<string, unknown> = {
    ...mergeTrackVars(params.trackVars),
    firstName,
    code: params.code,
    checkoutUrl,
  };
  const bare = (tier: string) => {
    if (tier !== "1h" && tier !== "3d" && tier !== "5d") return null;
    return {
      subject: conversionSubject(tier),
      body: buildConversionBody(tier, firstName, params.code, checkoutUrl, params.trackVars),
    };
  };

  const overrides = await getFunnelOverrides();
  const contentKey = params.contentKey && params.contentKey.startsWith(params.tier) ? params.contentKey : params.tier;
  const resolved = resolveFunnelCopyForKey({
    funnel: "conversion",
    contentKey,
    vars,
    overrides,
    codeDefaultForKey: makeLocalCodeDefault("conversion", bare, vars),
  });
  if (!resolved.subject || !resolved.body) {
    console.error("conversion-emails: no copy resolved", { tier: params.tier, contentKey });
    return false;
  }
  // Funnels v2 only: A/B overlay + step tracking.
  const sendCopy = params.trackVars || params.contentKey
    ? await withFunnelExperiment({
        funnel: "conversion",
        contentKey: contentKey,
        email: params.to,
        control: { subject: resolved.subject, body: resolved.body },
        vars: vars,
      })
    : { subject: resolved.subject, body: resolved.body, tracking: {} };
  const ok = await sendMarketingEmail({
    from: "Influencer Butler <affiliates@influencerbutler.com>",
    to: params.to,
    subject: sendCopy.subject,
    text: sendCopy.body,
    category: `conversion_${params.tier}`,
    funnel: "conversion",
    trackOpens: true,
    ...sendCopy.tracking,
  });
  if (ok && resolved.applyTag) {
    try {
      await tagRecipientsAsContacts(createAdminClient(), [params.to], resolved.applyTag, "funnel:conversion");
    } catch (err) {
      console.error("conversion-emails: tag-on-send failed", err);
    }
  }
  return ok;
}
