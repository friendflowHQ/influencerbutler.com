// Day-45 "leave a testimonial" ask - plain-text email via Resend. Mirrors
// src/lib/trial-emails.ts / pro-emails.ts in style (direct fetch, no template
// library). Sent by the /api/cron/testimonial-requests cron once per subscriber.
//
// No incentive is offered: Lemon Squeezy cannot apply a discount to an existing
// subscription's next renewal via API, so we keep this a straight goodwill ask.
// If that changes, add the offer line to the body below.

import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";

const FROM_ADDRESS = "Influencer Butler <hello@influencerbutler.com>";
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;

export type TestimonialEmailPayload = {
  to: string;
  name: string;
  feedbackUrl: string;
};

const SUBJECT = "Quick favor? Two months in, how's Influencer Butler treating you";

function buildBody(firstName: string, feedbackUrl: string): string {
  return [
    `Hi ${firstName},`,
    ``,
    `You've been with Influencer Butler for about two months now, which tells us it's earning its keep. That means a lot to our small team.`,
    ``,
    `Would you share a sentence or two about how it's going? Other creators sizing us up trust a real customer far more than anything we could say, and it takes about two minutes.`,
    ``,
    `Leave a quick review here: ${feedbackUrl}`,
    ``,
    `Add a star rating, a line about what it's helped you do, and (if you like) a photo. If we feature it, it goes straight onto our homepage.`,
    ``,
    `Either way, thank you for being here.`,
    ``,
    COMMUNITY_LINE,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");
}

export async function sendTestimonialEmail(payload: TestimonialEmailPayload): Promise<boolean> {
  const firstName = payload.name.split(" ")[0] || "there";
  const body = buildBody(firstName, payload.feedbackUrl);

  return sendMarketingEmail({
    from: FROM_ADDRESS,
    to: payload.to,
    subject: SUBJECT,
    text: body,
    category: "testimonial_request",
  });
}
