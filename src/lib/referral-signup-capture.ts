import { readAffiliateSourceCookie } from "@/lib/promo";
import { lookupAffiliateOwnerByCode } from "@/lib/affiliate-lookup";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stamps the referring affiliate onto a freshly created profile, first-touch,
 * from the ib_aff_src cookie. This is what lets the affiliate dashboard count
 * FREE signups - paid/trial referrals are already attributed on orders and
 * subscriptions by the Lemon Squeezy webhook, but a free account never
 * produces an LS event, so without this stamp it is invisible to the
 * affiliate who referred it.
 *
 * Best-effort by design: every failure is logged and swallowed so the auth
 * flow (email-confirmation callback, signup) is never blocked by attribution.
 *
 * Intentionally NOT called for webhook-provisioned users (ensureUserForEmail
 * in the LS webhook): those went straight to checkout, already carry
 * order/subscription attribution, and are not "free signups".
 */

type CookieReader = {
  get: (name: string) => { value: string } | undefined;
};

/**
 * The auth callback also fires for ordinary magic-link logins of old
 * accounts. Only accounts created inside this window are considered
 * "signups" and eligible for a referral stamp.
 */
export const SIGNUP_REFERRAL_MAX_ACCOUNT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isEligibleNewAccount(
  userCreatedAt: string | null | undefined,
  nowMs: number,
): boolean {
  if (!userCreatedAt) return false;
  const createdMs = Date.parse(userCreatedAt);
  if (Number.isNaN(createdMs)) return false;
  const age = nowMs - createdMs;
  return age >= 0 && age <= SIGNUP_REFERRAL_MAX_ACCOUNT_AGE_MS;
}

export async function captureSignupReferral(args: {
  userId: string;
  userCreatedAt: string | null | undefined;
  /** Used only when the profiles row does not exist yet and has to be
   *  inserted (email is NOT NULL); never returned to any client. */
  userEmail: string | null | undefined;
  cookieStore: CookieReader;
}): Promise<void> {
  try {
    const code = readAffiliateSourceCookie(args.cookieStore);
    if (!code) return;

    if (!isEligibleNewAccount(args.userCreatedAt, Date.now())) return;

    // Only stamp codes that belong to a real affiliate (mirrors the junk-code
    // guard on the click-logging endpoint).
    const owner = await lookupAffiliateOwnerByCode(code);
    if (!owner) return;

    // Self-referral guard.
    if (owner.affiliateUserId === args.userId) return;

    const admin = createAdminClient();

    // First-touch: never overwrite an existing stamp.
    const { data: existing, error: readErr } = await admin
      .from("profiles")
      .select("id, ref_affiliate_user_id")
      .eq("id", args.userId)
      .maybeSingle();
    if (readErr) {
      // Most likely the 20260719 migration hasn't been hand-applied yet.
      console.warn("signup-referral: profiles read skipped", readErr);
      return;
    }
    if (existing?.ref_affiliate_user_id) return;

    const stamp = {
      ref_affiliate_user_id: owner.affiliateUserId,
      ref_affiliate_code: owner.code.toUpperCase(),
      ref_captured_at: new Date().toISOString(),
    };

    if (existing) {
      // Existing row: update only the stamp columns. Never write email here,
      // and never via upsert: profiles.email is NOT NULL and Postgres checks
      // the proposed insert row BEFORE on-conflict resolution, so an upsert
      // with email null fails 23502 even when the row exists.
      const { error: writeErr } = await admin
        .from("profiles")
        .update(stamp)
        .eq("id", args.userId);
      if (writeErr) {
        console.warn("signup-referral: profiles update skipped", writeErr);
      }
    } else {
      // No profiles row yet (there is no handle_new_user trigger, so at
      // confirmation time it may not exist). The insert needs a real email
      // to satisfy NOT NULL; without one the stamp cannot land.
      if (!args.userEmail) {
        console.warn("signup-referral: no email for new profile row, stamp skipped", {
          userId: args.userId,
        });
        return;
      }
      const { error: writeErr } = await admin.from("profiles").insert({
        id: args.userId,
        email: args.userEmail,
        ...stamp,
      });
      if (writeErr) {
        console.warn("signup-referral: profiles insert skipped", writeErr);
      }
    }
  } catch (err) {
    console.warn("signup-referral: capture skipped", err);
  }
}
