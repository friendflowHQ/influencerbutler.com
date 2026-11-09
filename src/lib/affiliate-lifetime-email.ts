/**
 * Notification sent to one affiliate when an admin grants them lifetime
 * commission terms (Roster > Terms > Lifetime). Transactional, direct to Resend
 * like the comp and statement emails; best-effort, never throws.
 */

import { sendEmail } from "@/lib/email-send";

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";
const REPLY_TO = "affiliates@influencerbutler.com";

function siteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");
}

function bodyToHtml(text: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 16px;">${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1f2937;">${paragraphs}</div>`;
}

export function buildLifetimeTermsEmail(params: {
  name: string | null;
  ratePercent: number;
  affiliateCode: string | null;
}): { subject: string; text: string } {
  const first = (params.name ?? "").trim().split(/\s+/)[0] || "there";
  const site = siteUrl();
  const code = params.affiliateCode?.trim() || null;

  const lines = [
    `Hi ${first},`,
    ``,
    `Thank you for everything you've done to share Influencer Butler. We noticed, and we wanted to say thank you in a way that counts.`,
    ``,
    `Starting today, you earn ${params.ratePercent}% for life on every customer you refer. Our standard affiliate program pays for the first 12 months of each subscription. Yours has no end date: as long as someone you referred stays subscribed, you keep earning on every payment.`,
    ``,
    `This is a special arrangement we've made just for you, outside our standard program. It covers people you've already referred too, not just new ones.`,
    ``,
  ];
  if (code) {
    lines.push(
      `Nothing changes on your end. Keep sharing your code ${code} or your link:`,
      `${site}/?code=${encodeURIComponent(code)}`,
    );
  } else {
    lines.push(`Nothing changes on your end. Keep sharing your code and link just as you do today.`);
  }
  lines.push(
    ``,
    `Your affiliate dashboard now shows your lifetime terms:`,
    `${site}/dashboard/affiliates`,
    ``,
    `Thank you for being part of this. Just reply if you have any questions.`,
    ``,
    `Liz`,
    `Influencer Butler`,
  );

  return { subject: "You now earn for life on every referral", text: lines.join("\n") };
}

export async function sendLifetimeTermsEmail(params: {
  to: string;
  name: string | null;
  ratePercent: number;
  affiliateCode: string | null;
}): Promise<boolean> {
  try {
    const { subject, text } = buildLifetimeTermsEmail(params);
    const { ok } = await sendEmail({
      from: FROM_ADDRESS,
      to: params.to,
      subject,
      text,
      html: bodyToHtml(text),
      replyTo: REPLY_TO,
      category: "affiliate_lifetime_terms",
    });
    return ok;
  } catch (err) {
    console.error("sendLifetimeTermsEmail failed", err);
    return false;
  }
}
