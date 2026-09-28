// Follow-up survey for cancellations that never went through our in-app cancel
// funnel (a lapsed payment, or cancelling from a Lemon Squeezy email/portal
// link). Sent from the subscription_cancelled webhook when no reason row
// already exists. Goes through sendMarketingEmail so it respects the
// unsubscribe/suppression list.

import { sendMarketingEmail } from "@/lib/marketing-email";

const SITE = "https://www.influencerbutler.com";

export async function sendCancelSurveyEmail(params: {
  to: string;
  token: string;
  name?: string | null;
}): Promise<boolean> {
  const firstName = (params.name ?? "").split(" ")[0] || "there";
  const surveyUrl = `${SITE}/cancel-survey?token=${encodeURIComponent(params.token)}`;

  const body = [
    `Hi ${firstName},`,
    ``,
    `We noticed your Influencer Butler subscription just ended, and we'd love to understand why.`,
    ``,
    `It's one quick question (plus anything else you want to add) and it genuinely shapes what we build next:`,
    ``,
    surveyUrl,
    ``,
    `Thank you for giving Influencer Butler a try. If there's anything we can help with, just reply to this email.`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");

  return sendMarketingEmail({
    from: "Influencer Butler <support@influencerbutler.com>",
    to: params.to,
    subject: "Quick question: why did you cancel?",
    text: body,
    category: "cancel_survey",
  });
}
