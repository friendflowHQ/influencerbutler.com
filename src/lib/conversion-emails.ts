import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { getFunnelOverrides, resolveFunnelCopy } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";

export type ConversionTier = "1h" | "3d" | "5d";

type TierCopy = {
  subject: string;
  leadLine: string;
  offerLine: string;
  finalSell: string;
};

export const CONVERSION_COPY: Record<ConversionTier, TierCopy> = {
  "1h": {
    subject: "A little welcome gift: 20% off your first month",
    leadLine:
      "Since you're now part of the Influencer Butler affiliate program, we'd love to have you on the inside as a customer too.",
    offerLine: "Use code {CODE} at checkout for 20% off your first month.",
    finalSell:
      "Knowing the product firsthand makes your referrals way more convincing - and you keep 30% recurring on everyone you bring in, for the first 12 months of each subscription.",
  },
  "3d": {
    subject: "Still on the fence? Here's 30% off your first month",
    leadLine:
      "Quick nudge - if you've been thinking about spinning up Influencer Butler for your own creator accounts, we bumped your welcome offer.",
    offerLine: "Use code {CODE} at checkout for 30% off your first month.",
    finalSell:
      "Using the product makes every pitch to your audience land harder. And 30% commission on each referral - paid for the first 12 months - stacks fast.",
  },
  "5d": {
    subject: "Final offer: 50% off your first month (one-time code)",
    leadLine:
      "Last one from us. We generated a single-use code just for you - after this, we won't keep nudging.",
    offerLine: "Use code {CODE} at checkout for 50% off your first month.",
    finalSell:
      "This code is locked to your account and only works once. After that, regular pricing applies. Good luck either way - and thanks for repping Influencer Butler.",
  },
};

export function conversionSubject(tier: ConversionTier): string {
  return CONVERSION_COPY[tier].subject;
}

export function buildConversionBody(
  tier: ConversionTier,
  firstName: string,
  code: string,
  checkoutUrl: string,
): string {
  const copy = CONVERSION_COPY[tier];
  return [
    `Hi ${firstName},`,
    ``,
    copy.leadLine,
    ``,
    copy.offerLine.replace("{CODE}", code),
    ``,
    `Grab it here: ${checkoutUrl}`,
    ``,
    copy.finalSell,
    ``,
    `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");
}

export async function sendConversionEmail(params: {
  tier: ConversionTier;
  to: string;
  name: string;
  code: string;
  checkoutUrl?: string;
}): Promise<boolean> {
  const firstName = params.name.split(" ")[0] || "there";
  const checkoutUrl =
    params.checkoutUrl ??
    `https://www.influencerbutler.com/pricing?code=${encodeURIComponent(params.code)}`;

  const subject = conversionSubject(params.tier);
  const body = buildConversionBody(params.tier, firstName, params.code, checkoutUrl);

  const overrides = await getFunnelOverrides();
  const resolved = resolveFunnelCopy({
    funnel: "conversion",
    tier: params.tier,
    vars: { firstName, code: params.code, checkoutUrl } as Record<string, unknown>,
    defaults: { subject, body },
    overrides,
  });
  const ok = await sendMarketingEmail({
    from: "Influencer Butler <affiliates@influencerbutler.com>",
    to: params.to,
    subject: resolved.subject,
    text: resolved.body,
    category: `conversion_${params.tier}`,
    funnel: "conversion",
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
