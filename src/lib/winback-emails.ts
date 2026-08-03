// Win-back funnel: plain-text re-engagement emails for churned customers, sent
// by the /api/cron/winback drip. Mirrors the trial/pro funnel style (a COPY map
// of subject + build(vars), delivered through sendMarketingEmail so suppression
// and the unsubscribe footer are handled in one place).
//
// Two segments, chosen from the cancel reason:
//   - "comp":     people who couldn't get set up, wanted a missing feature, or
//                 weren't using it yet. Offer = a free 2-month Pro comp, given
//                 via a claim link (issueInHouseComp runs only when they click).
//   - "discount": people who left because of price. Offer = a single-use Lemon
//                 Squeezy re-subscribe code (no free product given away).
//
// The claim link is stateless: an HMAC of the cancellation row id proves the
// link came from an email we sent, so no per-send token row is needed (same
// pattern as email-unsubscribe.ts).

import crypto from "node:crypto";
import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";

const FROM_ADDRESS = "Influencer Butler <support@influencerbutler.com>";

/** Free-window length of the win-back comp, in months. Used by the claim route. */
export const WINBACK_COMP_MONTHS = 2;
/** Number of billing cycles the re-subscribe discount repeats for. */
export const WINBACK_DISCOUNT_MONTHS = 3;

export type WinbackSegment = "comp" | "discount";
export type WinbackTier = "t1" | "t2" | "t3";

/** Which drip track a cancel reason belongs to. Price -> discount, else comp. */
export function resolveSegment(reason: string | null | undefined): WinbackSegment {
  return reason === "too_expensive" ? "discount" : "comp";
}

/** Re-subscribe discount percent, env-overridable, clamped to a sane range. */
export function winbackDiscountPercent(): number {
  const raw = process.env.WINBACK_DISCOUNT_PERCENT;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return 40;
  return parsed;
}

function siteUrl(): string {
  const raw =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  return raw.replace(/\/$/, "");
}

// Server-only secret for signing claim links. Mirrors email-unsubscribe.ts: a
// dedicated var is preferred, but stable server secrets work so prod needs no
// new env var. The value only has to be stable and secret.
function claimSecret(): string {
  const s =
    process.env.WINBACK_CLAIM_SECRET ||
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  if (!s) console.error("winback: no signing secret configured");
  return s;
}

/** HMAC token proving a claim link came from an email we sent. Empty if no secret. */
export function winbackClaimToken(rowId: string): string {
  const key = claimSecret();
  if (!key) return "";
  return crypto.createHmac("sha256", key).update(rowId).digest("base64url");
}

/** Constant-time verification of a claim token against a row id. */
export function verifyWinbackClaimToken(rowId: string, token: string): boolean {
  const expected = winbackClaimToken(rowId);
  if (!expected || !token) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Public claim URL that mints the comp when the recipient clicks it. */
export function winbackClaimUrl(rowId: string): string {
  const id = encodeURIComponent(rowId);
  const t = encodeURIComponent(winbackClaimToken(rowId));
  return `${siteUrl()}/api/winback/claim?id=${id}&t=${t}`;
}

/** Public re-checkout URL with the discount code prefilled. */
export function winbackCheckoutUrl(code: string): string {
  return `${siteUrl()}/pricing?code=${encodeURIComponent(code)}`;
}

/** Login-gated booking page, offered to the "couldn't set it up" crowd. */
function bookCallUrl(): string {
  return `${siteUrl()}/dashboard/book`;
}

const HELP_URL = "https://www.influencerbutler.com/help";
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;
const SIGNOFF = "- The Influencer Butler team";

type WinbackVars = {
  firstName: string;
  isTechnical: boolean;
  // Comp segment:
  claimUrl: string;
  // Discount segment:
  discountCode: string;
  discountPercent: number;
  checkoutUrl: string;
};

type TierCopy = {
  subject: string | ((vars: WinbackVars) => string);
  build: (vars: WinbackVars) => string;
};

const COPY: Record<WinbackSegment, Record<WinbackTier, TierCopy>> = {
  comp: {
    t1: {
      subject: "We made Influencer Butler a lot easier to get going",
      build: (v) => {
        const lines = [
          `Hi ${v.firstName},`,
          ``,
          `You gave Influencer Butler a try and it didn't fully click - that's on us, not you. Since you left we've made real progress on the parts people got stuck on: faster setup, clearer first-run steps, and better in-app help.`,
          ``,
          `Nothing to do right now. This is just a heads-up that if the timing was the problem, it's a good moment to take another look.`,
          ``,
          `Every tutorial, step by step: ${HELP_URL}`,
        ];
        if (v.isTechnical) {
          lines.push(
            ``,
            `If setup was where it went sideways, let us do it with you. Grab a free 15-minute screen-share and we'll get you live: ${bookCallUrl()}`,
          );
        }
        lines.push(``, `Just reply to this email with any question - a real human answers.`, ``, COMMUNITY_LINE, ``, SIGNOFF);
        return lines.join("\n");
      },
    },
    t2: {
      subject: (v) => `${v.firstName}, here's 2 months of Pro on us`,
      build: (v) => {
        const lines = [
          `Hi ${v.firstName},`,
          ``,
          `We'd love a second chance to earn your business, so here's a genuine offer: 2 months of Influencer Butler Pro, completely free. No card, no auto-charge when it ends.`,
          ``,
          `Claim your 2 free months here: ${v.claimUrl}`,
          ``,
          `Click it and we'll set up your free Pro workspace and email your license key straight away. Every butler unlocked for two full months so you can see the results on your own numbers.`,
        ];
        if (v.isTechnical) {
          lines.push(
            ``,
            `Want a hand getting set up this time? Book a free 15-minute call and we'll do it together: ${bookCallUrl()}`,
          );
        }
        lines.push(``, `Questions? Just reply. And tutorials for every butler live here: ${HELP_URL}`, ``, COMMUNITY_LINE, ``, SIGNOFF);
        return lines.join("\n");
      },
    },
    t3: {
      subject: "Last call: your 2 free months of Pro",
      build: (v) => {
        return [
          `Hi ${v.firstName},`,
          ``,
          `Quick last note: the 2 free months of Influencer Butler Pro we set aside for you are still here, but we'll close the offer soon.`,
          ``,
          `Claim them here while they're open: ${v.claimUrl}`,
          ``,
          `One click sets up your free Pro workspace and emails your license key. No card, and nothing charges when the two months are up.`,
          ``,
          `If now isn't the right time, no worries at all - your free-forever butlers and the Chrome extension keep working regardless.`,
          ``,
          COMMUNITY_LINE,
          ``,
          SIGNOFF,
        ].join("\n");
      },
    },
  },
  discount: {
    t1: {
      subject: "A lot has changed at Influencer Butler",
      build: (v) => {
        return [
          `Hi ${v.firstName},`,
          ``,
          `You cancelled Influencer Butler a little while back, and we get it - it has to earn its price every month. Since you left we've kept shipping: more automation, better targeting, and workflows that do more of the work for you.`,
          ``,
          `No offer today, just an invitation to see what's new: ${HELP_URL}`,
          ``,
          `If there's a specific reason the value wasn't there for you, reply and tell me. I read every email.`,
          ``,
          COMMUNITY_LINE,
          ``,
          SIGNOFF,
        ].join("\n");
      },
    },
    t2: {
      subject: (v) => `${v.firstName}, come back for ${v.discountPercent}% off`,
      build: (v) => {
        return [
          `Hi ${v.firstName},`,
          ``,
          `If price was the sticking point, let's fix that. Here's ${v.discountPercent}% off your first ${WINBACK_DISCOUNT_MONTHS} months of Pro when you come back:`,
          ``,
          `  Code: ${v.discountCode}`,
          `  Reactivate here: ${v.checkoutUrl}`,
          ``,
          `The code is unique to you and single-use, and it's already applied when you use the link above. That's ${v.discountPercent}% off, every month, for ${WINBACK_DISCOUNT_MONTHS} months.`,
          ``,
          `See everything that's new since you left: ${HELP_URL}`,
          ``,
          COMMUNITY_LINE,
          ``,
          SIGNOFF,
        ].join("\n");
      },
    },
    t3: {
      subject: (v) => `Last call: ${v.discountPercent}% off to come back`,
      build: (v) => {
        return [
          `Hi ${v.firstName},`,
          ``,
          `Last reminder: your personal ${v.discountPercent}% off code expires soon.`,
          ``,
          `  Code: ${v.discountCode}`,
          `  Reactivate here: ${v.checkoutUrl}`,
          ``,
          `That's ${v.discountPercent}% off Pro every month for ${WINBACK_DISCOUNT_MONTHS} months. The code is single-use and locked to your account, and after this we'll stop emailing about it.`,
          ``,
          `Either way, thanks for giving us a try - the door's always open.`,
          ``,
          COMMUNITY_LINE,
          ``,
          SIGNOFF,
        ].join("\n");
      },
    },
  },
};

export type WinbackEmailPayload = {
  segment: WinbackSegment;
  tier: WinbackTier;
  to: string;
  name: string;
  reason: string | null;
  /** Comp segment: the personal claim link. Ignored by the discount segment. */
  claimUrl?: string;
  /** Discount segment: the minted code + its percent. Ignored by comp. */
  discountCode?: string;
  discountPercent?: number;
};

export async function sendWinbackEmail(payload: WinbackEmailPayload): Promise<boolean> {
  const copy = COPY[payload.segment][payload.tier];
  const firstName = payload.name.split(" ")[0] || "there";
  const discountCode = payload.discountCode ?? "";

  const vars: WinbackVars = {
    firstName,
    isTechnical: payload.reason === "technical_issues",
    claimUrl: payload.claimUrl ?? "",
    discountCode,
    discountPercent: payload.discountPercent ?? winbackDiscountPercent(),
    checkoutUrl: discountCode ? winbackCheckoutUrl(discountCode) : `${siteUrl()}/pricing`,
  };

  const subject = typeof copy.subject === "function" ? copy.subject(vars) : copy.subject;
  const body = copy.build(vars);

  return sendMarketingEmail({ from: FROM_ADDRESS, to: payload.to, subject, text: body });
}
