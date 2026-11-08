/**
 * Customer-facing end-of-comp flow: the 7-day and 1-day emails from Liz, the
 * owner's "creator comp ends in 7 days" alert, and the signed "Keep my plan"
 * link that opens a Lemon Squeezy checkout with a delayed first charge.
 *
 * Who gets the customer emails: win-back and creator comps only. Affiliate VIP
 * passes, no-card trials and referral rewards have their own messaging and are
 * left alone. Creator comps get softer, thank-you wording.
 *
 * Never charges anyone: the button only opens a checkout. The new subscription
 * starts on the plan's built-in free trial, and the webhook moves that trial's
 * end to the comp end date, so the first charge lands the day the comp ends.
 */
import crypto from "crypto";
import { bodyToHtml } from "@/lib/newsletter";
import { sendEmail } from "@/lib/email-send";
import { transactionalFrom } from "@/lib/email-senders";
import { compAlertRecipients } from "@/lib/comp-expiry-email";
import type { CompRow } from "@/lib/comps-data";

/** Comp kinds that get the customer end-of-comp emails, banner and end screen copy. */
export const CUSTOMER_NOTICE_KINDS = new Set(["winback", "creator"]);

export function siteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");
}

// Same secret fallback chain as the win-back claim links: a dedicated var is
// preferred, but a stable server secret works so prod needs no new env var.
function keepSecret(): string {
  return (
    process.env.COMP_KEEP_SECRET ||
    process.env.WINBACK_CLAIM_SECRET ||
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    ""
  );
}

/** HMAC proving a Keep-my-plan link came from us. Keyed on the comp subscription id. */
export function keepPlanToken(lsSubscriptionId: string): string {
  const key = keepSecret();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(`keep:${lsSubscriptionId}`).digest("base64url");
}

export function verifyKeepPlanToken(lsSubscriptionId: string, token: string): boolean {
  const expected = keepPlanToken(lsSubscriptionId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** The one-click "Keep my plan" link (no sign-in needed: the token proves it). */
export function keepPlanUrl(lsSubscriptionId: string, src = "email"): string {
  const params = new URLSearchParams({ c: lsSubscriptionId, t: keepPlanToken(lsSubscriptionId), src });
  return `${siteUrl()}/api/comps/keep?${params.toString()}`;
}

/** "Tuesday, November 18" in US Mountain time (the business's time zone). */
export function formatCompDate(iso: string | null): string {
  if (!iso) return "soon";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "soon";
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "America/Denver",
  });
}

function firstName(row: CompRow): string {
  const n = (row.name ?? "").trim().split(/\s+/)[0];
  return n && n.length > 1 ? n : "there";
}

const FREE_LINE =
  "If you decide not to, nothing bad happens: your free butlers (like Like Butler, CC Check and Orders Butler) keep working, and you are never charged unless you add a card yourself.";

export type CustomerNotice = "warn7" | "warn1";

export function buildCustomerEmail(
  row: CompRow,
  notice: CustomerNotice,
): { subject: string; body: string } {
  const date = formatCompDate(row.expiresAt);
  const plan = row.planLabel || "Pro";
  const link = keepPlanUrl(row.lsSubscriptionId, notice);
  const hi = `Hi ${firstName(row)},`;
  const creator = row.kind === "creator";

  if (notice === "warn7") {
    const subject = creator
      ? `Thank you, and a heads-up: your free ${plan} access ends ${date}`
      : `Your free ${plan} access ends ${date}`;
    const body = creator
      ? [
          hi,
          `Thank you so much for being part of Influencer Butler. Having you use it and share it has meant a lot to me.`,
          `I wanted to give you plenty of notice: your complimentary ${plan} access ends on ${date}.`,
          `If you would like to keep everything running, you can add a card here and stay on ${plan}. Your first charge would not happen until ${date}, so you keep every free day:`,
          `Keep my plan: ${link}`,
          FREE_LINE,
          `Thank you again. Just reply if you have any questions.`,
          `- Liz`,
        ].join("\n\n")
      : [
          hi,
          `Liz here. Quick note so nothing catches you by surprise: your free ${plan} access ends on ${date}.`,
          `If Influencer Butler has been helping, you can keep your plan with one click. Add a card now and your first charge is not until ${date}, so you keep the rest of your free days:`,
          `Keep my plan: ${link}`,
          FREE_LINE,
          `Questions? Just reply, I read these.`,
          `- Liz`,
        ].join("\n\n");
    return { subject, body };
  }

  const subject = creator
    ? `Last reminder: your free ${plan} access ends ${date} (thank you!)`
    : `Last reminder: your free ${plan} access ends ${date}`;
  const body = creator
    ? [
        hi,
        `A gentle last reminder: your complimentary ${plan} access ends on ${date}.`,
        `If you would like to keep it, you can add a card here. Your first charge would be on ${date}:`,
        `Keep my plan: ${link}`,
        FREE_LINE,
        `Thank you for everything you have done for Influencer Butler.`,
        `- Liz`,
      ].join("\n\n")
    : [
        hi,
        `Just a last reminder: your free ${plan} access ends on ${date}.`,
        `To keep your butlers running, add a card here. Your first charge is on ${date}:`,
        `Keep my plan: ${link}`,
        FREE_LINE,
        `- Liz`,
      ].join("\n\n");
  return { subject, body };
}

export async function sendCustomerCompEmail(row: CompRow, notice: CustomerNotice): Promise<boolean> {
  if (!row.email) return false;
  const { subject, body } = buildCustomerEmail(row, notice);
  const res = await sendEmail({
    from: transactionalFrom(),
    to: row.email,
    subject,
    text: body,
    html: bodyToHtml(body),
    category: notice === "warn7" ? "comp_ending_7d" : "comp_ending_1d",
    funnel: "conversion",
    stream: "transactional",
  });
  return res.ok;
}

function daysPhrase(row: CompRow): string {
  const d = row.daysRemaining;
  if (d == null) return "soon";
  if (d <= 0) return "within a day";
  return d === 1 ? "in 1 day" : `in ${d} days`;
}

/** Owner alert: one creator comp ends within about 7 days; extend it from the Comps page. */
export async function sendOwnerCreatorAlert(row: CompRow): Promise<boolean> {
  const who = row.name ? `${row.name} (${row.email ?? "no email"})` : row.email ?? row.lsSubscriptionId;
  const extendLink = `${siteUrl()}/dashboard/admin/comps?q=${encodeURIComponent(row.email ?? row.discountCode ?? "")}`;
  const body = [
    `A creator comp ends ${formatCompDate(row.expiresAt)} (${daysPhrase(row)}).`,
    `Who: ${who}`,
    `Code: ${row.discountCode ?? "none"}`,
    `Plan: ${row.planLabel ?? "Pro"}`,
    `Ends: ${formatCompDate(row.expiresAt)}`,
    `They get the thank-you reminder emails automatically. To extend their free access instead, open their comp and click Extend:`,
    extendLink,
  ].join("\n\n");
  let ok = false;
  for (const to of compAlertRecipients()) {
    const res = await sendEmail({
      from: transactionalFrom(),
      to,
      subject: `Creator comp ending ${daysPhrase(row)}: ${row.name ?? row.email ?? row.discountCode ?? "creator"}`,
      text: body,
      html: bodyToHtml(body),
      category: "comp_creator_owner_alert",
      stream: "transactional",
    });
    ok = ok || res.ok;
  }
  return ok;
}

/**
 * Owner alert from the webhook: a comped user kept their plan but the first
 * charge could not be moved to the comp end date (LS refused the trial-end
 * change), or the plan charged at checkout. Fix it by hand in Lemon Squeezy.
 */
export async function sendOwnerChargeAlert(args: {
  email: string | null;
  lsSubscriptionId: string;
  compEndsAt: string | null;
  reason: "patch_failed" | "charged_at_checkout";
}): Promise<void> {
  const when = formatCompDate(args.compEndsAt);
  const what =
    args.reason === "patch_failed"
      ? `Lemon Squeezy did not accept the new trial end. Open subscription ${args.lsSubscriptionId} in Lemon Squeezy and set its trial end to ${when} so they are not charged early.`
      : `Their new plan (subscription ${args.lsSubscriptionId}) started as active, so it charged at checkout instead of on ${when}. Consider a refund for the free days they lost.`;
  const body = [
    `A comped customer kept their plan, but the first charge was not delayed.`,
    `Who: ${args.email ?? "unknown"}`,
    `Free access ends: ${when}`,
    what,
  ].join("\n\n");
  for (const to of compAlertRecipients()) {
    try {
      await sendEmail({
        from: transactionalFrom(),
        to,
        subject: `Action needed: comp keep-my-plan charge not delayed (${args.email ?? args.lsSubscriptionId})`,
        text: body,
        html: bodyToHtml(body),
        category: "comp_charge_not_delayed",
        stream: "transactional",
      });
    } catch (error) {
      console.error("comp: owner charge alert failed", error);
    }
  }
}
