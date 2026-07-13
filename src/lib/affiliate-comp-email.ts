/**
 * Butler-voice notifications for the affiliate "VIP Guest Pass" (comp workspace)
 * privilege: a warm welcome when an admin first enables it, and a lighter note
 * when the monthly allowance changes.
 *
 * These are transactional account notifications (like the commission statement
 * and tax-reminder emails), so they go direct to Resend - NOT through
 * sendMarketingEmail, and they are not subject to the marketing suppression
 * list. Both senders are best-effort: a failure is logged, never thrown, so it
 * can never break the admin request that triggered it.
 */

const FROM_ADDRESS = "Influencer Butler <affiliates@influencerbutler.com>";
const REPLY_TO = "affiliates@influencerbutler.com";

function siteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");
}

/** Very small text -> HTML: paragraphs on blank lines, single newlines as <br>. */
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

async function sendViaResend(params: { to: string; subject: string; text: string }): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("affiliate-comp-email: RESEND_API_KEY not set - email skipped");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        reply_to: REPLY_TO,
        to: [params.to],
        subject: params.subject,
        text: params.text,
        html: bodyToHtml(params.text),
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error("affiliate-comp-email: send failed", { status: res.status, body: body.slice(0, 500) });
      return false;
    }
    return true;
  } catch (error) {
    console.error("affiliate-comp-email: send threw", error);
    return false;
  }
}

function greetingName(name: string | null | undefined): string {
  const trimmed = (name ?? "").trim();
  return trimmed ? ` ${trimmed}` : "";
}

/**
 * Welcome an affiliate to the VIP Guest Pass privilege the first time an admin
 * enables it. `quota` is their new monthly allowance.
 */
export async function sendAffiliateCompWelcomeEmail(params: {
  to: string;
  name: string | null;
  quota: number;
}): Promise<boolean> {
  const dash = `${siteUrl()}/dashboard/affiliates`;
  const passes = params.quota === 1 ? "guest pass" : "guest passes";
  const text = [
    `A word, if I may,${greetingName(params.name)}.`,
    ``,
    `You have been promoted. As one of our most valued affiliates, you now hold a privilege reserved for the few: the VIP Guest Pass. It lets you hand a prospect a free Influencer Butler Pro workspace, on the house, so they can see the magic for themselves long before they ever reach for their wallet.`,
    ``,
    `Think of it as the key to a guest suite. You decide who gets to stay, and for how long.`,
    ``,
    `WHAT YOU CAN DO`,
    `- Gift a full Pro workspace (a single seat) for up to 2 months.`,
    `- You have ${params.quota} ${passes} each month. They refresh on the 1st.`,
    `- Every pass carries YOUR referral link. So if your guest decides to stay on as a paying member, the commission is yours. This is not a giveaway: it is a seed.`,
    ``,
    `WHERE TO FIND IT`,
    `1. Sign in and open your Affiliate dashboard: ${dash}`,
    `2. Look for the "VIP Guest Passes" card.`,
    `3. Enter your prospect's email, choose the length, and send. I handle the rest: I deliver their key, set them up, and quietly tidy everything away when the free time is up.`,
    ``,
    `HOW TO USE IT IN THE WILD (a few suggestions from your butler)`,
    `- The fence-sitter: someone who keeps asking "but does it actually work?" Hand them two weeks and let the product answer for you.`,
    `- The warm DM: a creator you have been chatting with who has not pulled the trigger. A guest pass is a gracious nudge.`,
    `- The thank-you: a podcast host, a collab partner, a friend in the space. Gift a month; they experience Pro AND remember who sent them.`,
    `- The comeback: a trial that fizzled or a lead who went cold. A short pass can reopen the conversation.`,
    `- The room: speaking at an event or workshop? A pass for the standouts turns a handshake into a signup.`,
    ``,
    `A gentle word of counsel: use them wisely. Passes are limited, so aim them at people genuinely likely to stay. A well-placed gift converts; a scattered one simply spends your allowance.`,
    ``,
    `That will be all. Go make some VIPs of your own.`,
    ``,
    `At your service,`,
    `The Influencer Butler`,
  ].join("\n");

  return sendViaResend({
    to: params.to,
    subject: "A privilege, at your service: your VIP Guest Pass is ready",
    text,
  });
}

/**
 * Lighter note when an already-enabled affiliate's monthly allowance changes.
 * `previousQuota` is shown only when it is a known positive number.
 */
export async function sendAffiliateCompAllowanceChangedEmail(params: {
  to: string;
  name: string | null;
  quota: number;
  previousQuota: number | null;
}): Promise<boolean> {
  const dash = `${siteUrl()}/dashboard/affiliates`;
  const passes = params.quota === 1 ? "guest pass" : "guest passes";
  const previously =
    typeof params.previousQuota === "number" && params.previousQuota > 0
      ? ` (previously ${params.previousQuota})`
      : "";
  const text = [
    `A quick note,${greetingName(params.name)}.`,
    ``,
    `Your butler has updated your VIP Guest Pass allowance. You now have ${params.quota} ${passes} per month${previously}. They refresh on the 1st.`,
    ``,
    `Everything else works exactly as before: open your Affiliate dashboard, find the "VIP Guest Passes" card, and gift a free Pro workspace to anyone worth winning. Each pass carries your referral link, so a guest who stays on pays you.`,
    ``,
    `Open your dashboard: ${dash}`,
    ``,
    `At your service,`,
    `The Influencer Butler`,
  ].join("\n");

  return sendViaResend({
    to: params.to,
    subject: "A small adjustment to your VIP Guest Passes",
    text,
  });
}

/**
 * Brief, gracious note when an admin turns an affiliate's Guest Pass privilege
 * off. We keep it warm and non-accusatory: passes already handed out keep
 * running, only the ability to send new ones pauses.
 */
export async function sendAffiliateCompRevokedEmail(params: {
  to: string;
  name: string | null;
}): Promise<boolean> {
  const text = [
    `A quick note,${greetingName(params.name)}.`,
    ``,
    `Your VIP Guest Passes have been paused for now, so the "VIP Guest Passes" card will step out of your dashboard. Nothing else changes: any guests you have already welcomed keep their free time and everything you have earned is safe.`,
    ``,
    `This sort of thing comes and goes, and it may well return. If you have any questions, simply reply to this email and a real human will answer.`,
    ``,
    `At your service,`,
    `The Influencer Butler`,
  ].join("\n");

  return sendViaResend({
    to: params.to,
    subject: "Your VIP Guest Passes are paused",
    text,
  });
}
