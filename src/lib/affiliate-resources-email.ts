// Shared affiliate "dashboard + resources" email content.
//
// Used in two places: appended to the approval email (affiliates-approve.ts) so
// every newly auto-approved affiliate learns about their dashboard, the Content
// Planner, and the Competitor Playbook; and as the body of the one-time admin
// broadcast to existing affiliates (admin-broadcast-resources route).
//
// Plain text, in the "butler" voice of the approval email. Deliberately
// number-agnostic on commission (custom-rate affiliates exist), and it names no
// competitors, per the repo copy rule.

const SITE = "https://www.influencerbutler.com";
const FROM = "Influencer Butler <affiliates@influencerbutler.com>";

/** The shared body: a short tour of the dashboard plus the two resources. */
export function affiliateResourcesLines(): string[] {
  return [
    `Your dashboard, and two resources to make this effortless`,
    ``,
    ``,
    `Everything lives at ${SITE}/dashboard/affiliates. Sign in with your account email and password, and you will find:`,
    ``,
    `    - Your branded code and a ready-to-share link, each with one-click copy.`,
    `    - A link builder for tracked links to any page on our site.`,
    `    - Live click analytics for your links, broken down by source, referrer, and country.`,
    `    - Your earnings at a glance: unpaid balance, paid to date, referred orders, and your commission rate.`,
    `    - Your tax form and PayPal payout settings, for whenever you are ready to be paid.`,
    ``,
    ``,
    `The Content Planner`,
    ``,
    `    Found at ${SITE}/dashboard/affiliates/planner. It gives you hooks and copy-paste captions sorted by focus, a five-email starter funnel, a fourteen-day launch calendar, and ready-made graphics you can save and post. Line it all up, drop in your tracked link, and go live the same day.`,
    ``,
    ``,
    `The Competitor Playbook`,
    ``,
    `    Also on your dashboard. Honest, side-by-side comparisons of Influencer Butler against the other Amazon-creator tools, ready talking points, and copy-paste captions written to name no competitors, so they are safe to post exactly as written.`,
    ``,
    ``,
  ];
}

/** The full one-time broadcast email for an existing affiliate. */
export function buildAffiliateResourcesEmail(params: {
  name: string | null;
  brandedCode: string | null;
  brandedShareLink: string | null;
}): { subject: string; text: string } {
  const firstName = (params.name ?? "").split(" ")[0] || "there";
  const lines: string[] = [
    `Dear ${firstName},`,
    ``,
    ``,
    `A brief note from your butler to make sure you are getting the very most from your Influencer Butler affiliate account.`,
    ``,
    ``,
  ];

  if (params.brandedCode) {
    lines.push(
      `Your personal code`,
      ``,
      ``,
      `    ${params.brandedCode}`,
      ``,
      ``,
      `Share it far and wide: every subscription it brings in is tracked to you automatically and earns you a recurring commission.`,
      ``,
      ``,
    );
    if (params.brandedShareLink) {
      lines.push(
        `Your ready-to-share link, with the code already applied:`,
        ``,
        `    ${params.brandedShareLink}`,
        ``,
        ``,
      );
    }
  }

  lines.push(...affiliateResourcesLines());

  lines.push(
    `Should you require anything at all, do reach us through our contact form at https://www.influencerbutler.com/contact and I shall attend to you promptly.`,
    ``,
    ``,
    `At your service,`,
    `The Influencer Butler`,
  );

  return {
    subject: "A tour of your affiliate dashboard, and resources to make promotion effortless",
    text: lines.join("\n"),
  };
}

/** Build the public share link for an affiliate code (matches the dashboard). */
export function affiliateShareLink(code: string): string {
  // Land prospects on the homepage (not /pricing) so the link reads as a clean
  // brand URL. The ?code= is captured there by /js/affiliate-touch.js, which
  // sets the ib_aff_src cookie so the affiliate's discount + attribution still
  // resolve at checkout. See src/app/api/checkout/route.ts.
  return `${SITE}/?code=${encodeURIComponent(code)}`;
}

/**
 * Transactional send (direct Resend), mirroring the approval email. The admin
 * chose a "reach every affiliate" send, so this bypasses the marketing
 * suppression/unsubscribe path. Returns true on Resend acceptance.
 */
export async function sendAffiliateResourcesEmail(
  to: string,
  subject: string,
  text: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to: [to], subject, text }),
    });
    return res.ok;
  } catch (error) {
    console.error("affiliate resources email send failed", error);
    return false;
  }
}
