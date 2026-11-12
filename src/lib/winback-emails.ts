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
// Funnels v2 copy: comp t1 is "What we fixed since you left" (a concrete list,
// every item checked against the product), discount t1 is the cheaper way back
// ("Beginner from {{beginnerPrice}}"), and every step mentions pausing instead
// of cancelling next time. Prices only come from track vars / constants.
//
// The claim link is stateless: an HMAC of the cancellation row id proves the
// link came from an email we sent, so no per-send token row is needed (same
// pattern as email-unsubscribe.ts).

import crypto from "node:crypto";
import { FACEBOOK_GROUP_URL } from "@/lib/social";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { withFunnelExperiment } from "@/lib/funnel-experiment-send";
import { getFunnelOverrides, resolveFunnelCopyForKey } from "@/lib/funnel-copy";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { createAdminClient } from "@/lib/supabase/admin";
import { makeLocalCodeDefault, mergeTrackVars, str, type LifecycleTrackVars } from "@/lib/pro-emails";
import { MAIN_FROM } from "@/lib/email-senders";

const FROM_ADDRESS = MAIN_FROM;

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

/** Login-gated booking page. Offered to the "couldn't set it up" crowd for the
 * free 75-minute Setup call, which any signed-in user can book, churned included
 * (scheduling.ts `demo`, requiresSubscription: false). The 45-minute Priority
 * 1:1 is Power-only, so the copy never promises that one here. */
function setupCallUrl(): string {
  return `${siteUrl()}/dashboard/book`;
}

const HELP_URL = "https://www.influencerbutler.com/help";
const EVENTS_URL = "https://www.influencerbutler.com/events";
const COMMUNITY_LINE = `Join our creator community on Facebook: ${FACEBOOK_GROUP_URL}`;
const SIGNOFF = "- Liz";

/** The "pause next time" note every step carries. */
export const WINBACK_PAUSE_LINE =
  "One thing that's new: if you come back and later need a break, you can pause your subscription for 1 to 3 months instead of cancelling. Nothing is charged while it's paused, and it picks back up on its own.";

export type WinbackVars = {
  firstName: string;
  isTechnical: boolean;
  // Comp segment:
  claimUrl: string;
  // Discount segment:
  discountCode: string;
  discountPercent: number;
  checkoutUrl: string;
} & Partial<LifecycleTrackVars>;

export type TierCopy = {
  subject: string | ((vars: WinbackVars) => string);
  build: (vars: WinbackVars) => string;
};

function setupCallLines(v: WinbackVars, lead: string): string[] {
  if (!v.isTechnical) return [];
  return [
    ``,
    `${lead} Book a free 1-hour-15-minute setup call and we'll set it up with you, any butler you want. Sign in with the email you used before, then pick a time: ${setupCallUrl()}`,
  ];
}

export const WINBACK_COPY: Record<WinbackSegment, Record<WinbackTier, TierCopy>> = {
  comp: {
    t1: {
      subject: "What we fixed since you left",
      build: (v) => {
        const events = str(v.eventLine) || `Live group calls with me and the team, where you can bring any question: ${EVENTS_URL}`;
        const beginner = str(v.beginnerPrice);
        const lines = [
          `Hi ${v.firstName},`,
          ``,
          `Liz here, founder of Influencer Butler. You gave us a try and it didn't fully click. That's on us, not you, so here is what we changed since you left:`,
          ``,
          `  - A guided walkthrough: the first time you open the app, it sets up the butlers for your goal in the right order.`,
          `  - A Beginner plan${beginner ? ` from ${beginner}` : ""}: the starter butlers with AI included (150 AI actions a month on our key, no OpenAI account needed). Move up to Power User in one click whenever you want.`,
          `  - Walmart and Target in the free Chrome extension: price, estimated commission and a Butler Score right on Walmart product pages, and money signals on Target.`,
          `  - Auto mode in the free extension: it can accept matching Creator Connections campaigns for you every 30 minutes while Chrome is open and you're signed in to Associates.`,
          `  - ${events}`,
          `  - Pause: next time you need a break, you can pause for 1 to 3 months instead of cancelling.`,
          ``,
          `Nothing to do right now. If the timing was the problem, it's a good moment to take another look.`,
          ``,
          `Every tutorial, step by step: ${HELP_URL}`,
          ...setupCallLines(v, "If setup is where it went sideways, let us do it with you."),
          ``,
          `Just reply with any question. I read every one.`,
          ``,
          COMMUNITY_LINE,
          ``,
          SIGNOFF,
        ];
        return lines.join("\n");
      },
    },
    t2: {
      subject: (v) => `${v.firstName}, here's 2 months of Pro on us`,
      build: (v) => {
        const lines = [
          `Hi ${v.firstName},`,
          ``,
          `I'd love a second chance to earn your business, so here's a genuine offer: 2 months of Influencer Butler Pro, completely free. No card, no auto-charge when it ends.`,
          ``,
          `Claim your 2 free months here: ${v.claimUrl}`,
          ``,
          `Click it and we'll set up your free workspace and email your license key straight away, so you can see the results on your own numbers.`,
          ...setupCallLines(v, "Want a hand getting set up this time?"),
          ``,
          WINBACK_PAUSE_LINE,
          ``,
          `Questions? Just reply. And tutorials for every butler live here: ${HELP_URL}`,
          ``,
          COMMUNITY_LINE,
          ``,
          SIGNOFF,
        ];
        return lines.join("\n");
      },
    },
    t3: {
      subject: "Last call: your 2 free months of Pro",
      build: (v) => {
        return [
          `Hi ${v.firstName},`,
          ``,
          `Quick last note: the 2 free months of Influencer Butler Pro I set aside for you are still here, but I'll close the offer soon.`,
          ``,
          `Claim them here while they're open: ${v.claimUrl}`,
          ``,
          `One click sets up your free workspace and emails your license key. No card, and nothing charges when the two months are up. And if you stay on afterwards and ever need a break, you can pause for 1 to 3 months instead of cancelling.`,
          ``,
          `If now isn't the right time, no worries at all. Your free-forever butlers and the Chrome extension keep working regardless.`,
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
      subject: (v) =>
        str(v.beginnerPrice) ? `A cheaper way back: Beginner from ${str(v.beginnerPrice)}` : "A cheaper way back: the Beginner plan",
      build: (v) => {
        const beginner = str(v.beginnerPrice);
        const lock = str(v.priceLockLine);
        return [
          `Hi ${v.firstName},`,
          ``,
          `Liz here. You cancelled because of price, and I get it: it has to earn its keep every month. So here's a cheaper way back you may not have seen yet.`,
          ``,
          `The Beginner plan${beginner ? ` starts at ${beginner}` : ""}. It has the starter butlers that earn first:`,
          `  - Daily Commission Butler reads what you sold yesterday and your storefront best-sellers, then auto-accepts the matching Creator Connections campaigns once a day.`,
          `  - Deal Posting finds deals from your keywords and posts them to your Facebook groups and pages on a schedule.`,
          `  - Video Reload and Photo Reload put back content Amazon removed.`,
          `  - AI included: 150 AI actions a month on our key, no OpenAI account needed.`,
          ``,
          `If you outgrow it, Power User is one click away and your settings come with you.`,
          ``,
          ...(lock ? [lock, ``] : []),
          `See both plans: ${v.checkoutUrl}`,
          ``,
          WINBACK_PAUSE_LINE,
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
          `If price was the sticking point, let's fix that. Here's ${v.discountPercent}% off your first ${WINBACK_DISCOUNT_MONTHS} months when you come back:`,
          ``,
          `  Code: ${v.discountCode}`,
          `  Reactivate here: ${v.checkoutUrl}`,
          ``,
          `The code is unique to you and single-use, and it's already applied when you use the link above. That's ${v.discountPercent}% off, every month, for ${WINBACK_DISCOUNT_MONTHS} months.`,
          ``,
          WINBACK_PAUSE_LINE,
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
          `That's ${v.discountPercent}% off every month for ${WINBACK_DISCOUNT_MONTHS} months. The code is single-use and locked to your account, and after this I'll stop emailing about it.`,
          ``,
          `And if you come back and need a break later, pause instead of cancelling: 1 to 3 months, nothing charged while paused.`,
          ``,
          `Either way, thanks for giving us a try. The door's always open.`,
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
  /** Funnels v2 track vars (funnel-personalize buildTrackVars); missing ones
   * fall back to defaultLifecycleTrackVars(). */
  trackVars?: Partial<LifecycleTrackVars>;
  /** Funnels v2 content key. Win-back steps are bare-only today, so this is
   * normally omitted (= "<segment>_<tier>"). */
  contentKey?: string;
};

/** The vars a win-back send renders with (exported for tests). */
export function winbackVarsFor(payload: WinbackEmailPayload): WinbackVars {
  const discountCode = payload.discountCode ?? "";
  return {
    ...mergeTrackVars(payload.trackVars),
    firstName: payload.name.split(" ")[0] || "there",
    isTechnical: payload.reason === "technical_issues",
    claimUrl: payload.claimUrl ?? "",
    discountCode,
    discountPercent: payload.discountPercent ?? winbackDiscountPercent(),
    checkoutUrl: discountCode ? winbackCheckoutUrl(discountCode) : `${siteUrl()}/pricing`,
  };
}

function winbackBare(vars: WinbackVars) {
  return (tier: string) => {
    const [segment, wt] = tier.split("_");
    const c = WINBACK_COPY[segment as WinbackSegment]?.[wt as WinbackTier];
    if (!c) return null;
    const subject = typeof c.subject === "function" ? c.subject(vars) : c.subject;
    return { subject, body: c.build(vars) };
  };
}

export async function sendWinbackEmail(payload: WinbackEmailPayload): Promise<boolean> {
  const vars = winbackVarsFor(payload);
  const rec = vars as unknown as Record<string, unknown>;
  const tierKey = `${payload.segment}_${payload.tier}`;
  const contentKey = payload.contentKey && payload.contentKey.startsWith(tierKey) ? payload.contentKey : tierKey;
  const overrides = await getFunnelOverrides();
  const resolved = resolveFunnelCopyForKey({
    funnel: "winback",
    contentKey,
    vars: rec,
    overrides,
    codeDefaultForKey: makeLocalCodeDefault("winback", winbackBare(vars), rec),
  });
  if (!resolved.subject || !resolved.body) {
    console.error("winback-emails: no copy resolved", { tierKey, contentKey });
    return false;
  }
  // Funnels v2 only: A/B overlay + step tracking.
  const sendCopy = payload.trackVars || payload.contentKey
    ? await withFunnelExperiment({
        funnel: "winback",
        contentKey: contentKey,
        email: payload.to,
        control: { subject: resolved.subject, body: resolved.body },
        vars: rec,
      })
    : { subject: resolved.subject, body: resolved.body, tracking: {} };
  const ok = await sendMarketingEmail({
    from: FROM_ADDRESS,
    to: payload.to,
    subject: sendCopy.subject,
    text: sendCopy.body,
    category: `winback_${payload.tier}`,
    funnel: "winback",
    trackOpens: true,
    ...sendCopy.tracking,
  });
  if (ok && resolved.applyTag) {
    try {
      await tagRecipientsAsContacts(createAdminClient(), [payload.to], resolved.applyTag, "funnel:winback");
    } catch (err) {
      console.error("winback-emails: tag-on-send failed", err);
    }
  }
  return ok;
}
