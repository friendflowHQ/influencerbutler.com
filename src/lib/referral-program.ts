// Consumer "invite a friend" referral loop: give a friend a free month, get a
// free month. Distinct from the affiliate program (cash commission) - this
// rewards ordinary users with free Pro. Everything here is gated behind
// REFERRAL_PROGRAM_ENABLED and is best-effort: a failure never blocks the auth
// callback or the Lemon Squeezy webhook it hooks into.
//
// See supabase/migrations/20260814_referral_program.sql for the schema.

import { randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { issueInHouseComp } from "@/lib/comp-issue";
import { sendMarketingEmail } from "@/lib/marketing-email";
import { isEligibleNewAccount } from "@/lib/referral-signup-capture";

export const REFERRAL_COOKIE = "ib_ref";
const FRIEND_FREE_MONTHS = 1;
const REFERRER_FREE_MONTHS = 1;
// Solo Pro (matches AFFILIATE_COMP_PLAN). Kept local to avoid importing the
// affiliate-comps module's other constants.
const REFERRAL_COMP_PLAN = "monthly";
const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];

type Admin = ReturnType<typeof createAdminClient>;
type CookieReader = { get: (name: string) => { value: string } | undefined };

export function referralProgramEnabled(): boolean {
  return process.env.REFERRAL_PROGRAM_ENABLED === "1";
}

function siteUrl(): string {
  return (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");
}

// --- Codes ----------------------------------------------------------------

function sanitizeBase(name: string | null | undefined): string {
  const cleaned = (name ?? "").split(" ")[0].toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
  return cleaned.length >= 2 ? cleaned : "IB";
}

function candidateCode(name: string | null | undefined): string {
  return `${sanitizeBase(name)}${randomBytes(2).toString("hex").toUpperCase()}`;
}

/** The referrer's personal code, created on first read. Uppercase, unique. */
export async function getOrCreateReferralCode(
  admin: Admin,
  userId: string,
  name: string | null | undefined,
  email: string | null | undefined,
): Promise<string | null> {
  try {
    const { data: prof } = await admin
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle();
    const existing = (prof as { referral_code?: string | null } | null)?.referral_code;
    if (typeof existing === "string" && existing.length > 0) return existing.toUpperCase();

    // Generate a unique code, retrying on the (rare) unique-index collision.
    for (let i = 0; i < 6; i += 1) {
      const code = candidateCode(name);
      const payload: Record<string, unknown> = { id: userId, referral_code: code };
      if (email) payload.email = email; // profiles.email is NOT NULL on insert
      const { error } = await admin.from("profiles").upsert(payload, { onConflict: "id" });
      if (!error) return code;
      console.warn("referral: code upsert retry", error);
    }
    return null;
  } catch (err) {
    console.warn("referral: getOrCreateReferralCode threw", err);
    return null;
  }
}

async function lookupReferrerByCode(
  admin: Admin,
  code: string,
): Promise<{ userId: string; email: string | null } | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("id,email")
    .eq("referral_code", code.toUpperCase())
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id?: string; email?: string | null };
  return row.id ? { userId: row.id, email: row.email ?? null } : null;
}

// --- Friend side: capture at signup + give the free month -----------------

/**
 * Called from the auth callback next to captureSignupReferral. Reads the ib_ref
 * cookie, records the referral, and gives the new friend a free month of Pro.
 * Best-effort and self-guarding.
 */
export async function captureFriendReferral(args: {
  userId: string;
  userEmail: string | null | undefined;
  userCreatedAt: string | null | undefined;
  cookieStore: CookieReader;
}): Promise<void> {
  try {
    if (!referralProgramEnabled()) return;
    const code = args.cookieStore.get(REFERRAL_COOKIE)?.value?.trim();
    if (!code) return;
    if (!isEligibleNewAccount(args.userCreatedAt, Date.now())) return;

    const admin = createAdminClient();
    const referrer = await lookupReferrerByCode(admin, code);
    if (!referrer) return;
    if (referrer.userId === args.userId) return; // self-referral

    // Idempotency: one referral row per referred user (unique index backs this).
    const { data: existing } = await admin
      .from("referrals")
      .select("id")
      .eq("referred_user_id", args.userId)
      .maybeSingle();
    if (existing) return;

    const insert = await admin.from("referrals").insert({
      referrer_user_id: referrer.userId,
      referrer_code: code.toUpperCase(),
      referred_email: args.userEmail ?? null,
      referred_user_id: args.userId,
      status: "pending",
    });
    if (insert.error) {
      console.warn("referral: referrals insert skipped", insert.error);
      return;
    }

    // Give the friend their free month of Pro.
    if (args.userEmail) {
      const result = await issueInHouseComp({
        email: args.userEmail,
        months: FRIEND_FREE_MONTHS,
        plan: REFERRAL_COMP_PLAN,
        forever: false,
        allowExisting: false,
      });
      if (result.ok) {
        await admin
          .from("referrals")
          .update({ friend_comp_issued_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("referred_user_id", args.userId);
      } else {
        // e.g. the friend already had a comp/subscription - keep the referral row
        // so the referrer is still rewarded when the friend converts.
        console.warn("referral: friend comp not issued", { status: result.status, error: result.error });
      }
    }
  } catch (err) {
    console.warn("referral: captureFriendReferral threw", err);
  }
}

// --- Referrer side: reward when the referred friend converts to paid -------

async function sendGiftPassEmail(to: string, key: string): Promise<void> {
  const site = siteUrl();
  const text = [
    `Thank you for spreading the word about Influencer Butler.`,
    ``,
    `Your friend just went Pro, so here is your reward: a free month of Pro to give to another friend.`,
    ``,
    `Their license key:`,
    ``,
    `    ${key}`,
    ``,
    `Send it to anyone. They download the app at ${site}/download and paste the key to unlock Pro for a month, no card.`,
    ``,
    `Want more? Your invite link is on your dashboard: ${site}/dashboard`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");
  await sendMarketingEmail({
    from: "Influencer Butler <hello@influencerbutler.com>",
    to,
    subject: "Your referral reward: a free month of Pro to gift",
    text,
  });
}

/**
 * Called from the Lemon Squeezy webhook when a subscription becomes active
 * (paid). If that subscriber was referred, reward the referrer with a free
 * month: a real Pro comp when they are on the free tier, or a transferable
 * gift pass when they already pay (LS cannot credit a free month onto a live
 * subscription). Idempotent via the referral row's status.
 */
export async function rewardReferrerForSubscription(lsSubscriptionId: string): Promise<void> {
  try {
    if (!referralProgramEnabled()) return;
    if (!lsSubscriptionId) return;
    const admin = createAdminClient();

    // Who paid?
    const { data: sub } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("ls_subscription_id", lsSubscriptionId)
      .maybeSingle();
    const friendUserId = (sub as { user_id?: string } | null)?.user_id;
    if (!friendUserId) return;

    // A pending referral for this friend?
    const { data: refRow } = await admin
      .from("referrals")
      .select("id,referrer_user_id,status")
      .eq("referred_user_id", friendUserId)
      .maybeSingle();
    const referral = refRow as
      | { id: string; referrer_user_id: string; status: string }
      | null;
    if (!referral || referral.status !== "pending") return;

    // Claim the transition first so a renewal webhook can't double-reward.
    const claim = await admin
      .from("referrals")
      .update({ status: "converted", updated_at: new Date().toISOString() })
      .eq("id", referral.id)
      .eq("status", "pending");
    if (claim.error) {
      console.warn("referral: reward claim update failed", claim.error);
      return;
    }

    // Referrer email + whether they already pay.
    const { data: referrerProfile } = await admin
      .from("profiles")
      .select("email")
      .eq("id", referral.referrer_user_id)
      .maybeSingle();
    const referrerEmail = (referrerProfile as { email?: string | null } | null)?.email ?? null;
    if (!referrerEmail) {
      console.warn("referral: referrer has no email, reward skipped", { id: referral.id });
      return;
    }

    const { data: liveSubs } = await admin
      .from("subscriptions")
      .select("id")
      .eq("user_id", referral.referrer_user_id)
      .in("status", LIVE_STATUSES)
      .limit(1);
    const referrerPays = Array.isArray(liveSubs) && liveSubs.length > 0;

    let kind: "comp" | "gift_pass";
    if (!referrerPays) {
      // Real free month: issueInHouseComp emails them the key + sign-in link.
      const result = await issueInHouseComp({
        email: referrerEmail,
        months: REFERRER_FREE_MONTHS,
        plan: REFERRAL_COMP_PLAN,
        forever: false,
        allowExisting: false,
      });
      kind = "comp";
      if (!result.ok) console.warn("referral: referrer comp not issued", { status: result.status });
    } else {
      // Paying referrer: mint an unassigned gift-pass key and email it to them.
      const pass = await issueInHouseComp({
        email: null,
        months: REFERRER_FREE_MONTHS,
        plan: REFERRAL_COMP_PLAN,
        forever: false,
      });
      kind = "gift_pass";
      if (pass.ok) {
        await sendGiftPassEmail(referrerEmail, pass.key);
      } else {
        console.warn("referral: gift pass not issued", { status: pass.status });
      }
    }

    await admin
      .from("referrals")
      .update({
        referrer_reward_issued_at: new Date().toISOString(),
        referrer_reward_kind: kind,
        updated_at: new Date().toISOString(),
      })
      .eq("id", referral.id);
  } catch (err) {
    console.warn("referral: rewardReferrerForSubscription threw", err);
  }
}

// --- Dashboard stats ------------------------------------------------------

export type ReferralStats = {
  code: string | null;
  link: string | null;
  friendsJoined: number;
  rewardsEarned: number;
};

export async function getReferralStats(
  admin: Admin,
  userId: string,
  name: string | null | undefined,
  email: string | null | undefined,
): Promise<ReferralStats> {
  const code = await getOrCreateReferralCode(admin, userId, name, email);
  const link = code ? `${siteUrl()}/r/${code}` : null;

  let friendsJoined = 0;
  let rewardsEarned = 0;
  try {
    const joined = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_user_id", userId);
    friendsJoined = joined.count ?? 0;
    const converted = await admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_user_id", userId)
      .eq("status", "converted");
    rewardsEarned = converted.count ?? 0;
  } catch (err) {
    console.warn("referral: stats read failed", err);
  }

  return { code, link, friendsJoined, rewardsEarned };
}
