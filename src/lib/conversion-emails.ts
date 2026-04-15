export type ConversionTier = "1h" | "3d" | "5d";

type TierCopy = {
  subject: string;
  leadLine: string;
  offerLine: string;
  finalSell: string;
};

const COPY: Record<ConversionTier, TierCopy> = {
  "1h": {
    subject: "A little welcome gift — 20% off your first month",
    leadLine:
      "Since you're now part of the Influencer Butler affiliate program, we'd love to have you on the inside as a customer too.",
    offerLine: "Use code {CODE} at checkout for 20% off your first month.",
    finalSell:
      "Knowing the product firsthand makes your referrals way more convincing — and you keep 35% recurring on everyone you bring in.",
  },
  "3d": {
    subject: "Still on the fence? Here's 30% off your first month",
    leadLine:
      "Quick nudge — if you've been thinking about spinning up Influencer Butler for your own creator accounts, we bumped your welcome offer.",
    offerLine: "Use code {CODE} at checkout for 30% off your first month.",
    finalSell:
      "Using the product makes every pitch to your audience land harder. And 35% commission on each referral stacks fast.",
  },
  "5d": {
    subject: "Final offer — 50% off your first month (one-time code)",
    leadLine:
      "Last one from us. We generated a single-use code just for you — after this, we won't keep nudging.",
    offerLine: "Use code {CODE} at checkout for 50% off your first month.",
    finalSell:
      "This code is locked to your account and only works once. After that, regular pricing applies. Good luck either way — and thanks for repping Influencer Butler.",
  },
};

export async function sendConversionEmail(params: {
  tier: ConversionTier;
  to: string;
  name: string;
  code: string;
  checkoutUrl?: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("RESEND_API_KEY not set — conversion email skipped");
    return false;
  }

  const copy = COPY[params.tier];
  const firstName = params.name.split(" ")[0] || "there";
  const checkoutUrl =
    params.checkoutUrl ??
    `https://www.influencerbutler.com/pricing?code=${encodeURIComponent(params.code)}`;

  const body = [
    `Hi ${firstName},`,
    ``,
    copy.leadLine,
    ``,
    copy.offerLine.replace("{CODE}", params.code),
    ``,
    `Grab it here: ${checkoutUrl}`,
    ``,
    copy.finalSell,
    ``,
    `— The Influencer Butler team`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Influencer Butler <affiliates@influencerbutler.com>",
        to: [params.to],
        subject: copy.subject,
        text: body,
      }),
    });
    return res.ok;
  } catch (error) {
    console.error("Conversion email send failed", error);
    return false;
  }
}
