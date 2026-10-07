/**
 * No-stacking eligibility: has this user already redeemed a discount?
 *
 * A customer who applied an affiliate code or a site-wide welcome/promo code at
 * checkout has used their one allowed discount (see the no-stacking policy in
 * public/legal/affiliate-terms.html 3(e) and applyStackingRules in
 * src/lib/promo-resolver.ts). Minting or showing them a second "member" trial
 * discount both violates that policy and generates support tickets, so the
 * trial-discount surfaces gate on this.
 *
 * Signals (any one is enough):
 *   - orders.discount_code present, or orders.discount_total_cents > 0
 *   - orders.ref_affiliate_code / ref_affiliate_user_id (affiliate referral)
 *   - subscriptions.ref_affiliate_code / ref_affiliate_user_id
 *   - profiles.ref_affiliate_code / ref_affiliate_user_id (referred before any
 *     purchase: web signup, Chrome extension, or desktop app)
 *
 * Reads are best-effort: these columns live on manual-apply migrations that can
 * lag prod (20260617 / 20260702 / 20260704). A read error is treated as "no
 * signal" so we fail open to the prior behavior rather than hiding a legitimate
 * code / blocking a legitimate mint.
 */

// Accepts any supabase client (service-role, admin, ssr). Their query-builder
// generics differ enough that a precise structural type fights all three, so we
// type `from` loosely and read the results defensively below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromClient = { from: (table: string) => any };

type OrderSignal = {
  discount_code?: string | null;
  discount_total_cents?: number | null;
  ref_affiliate_code?: string | null;
  ref_affiliate_user_id?: string | null;
};

type SubSignal = {
  ref_affiliate_code?: string | null;
  ref_affiliate_user_id?: string | null;
};

export async function hasRedeemedDiscount(
  client: FromClient,
  userId: string,
): Promise<boolean> {
  try {
    const { data } = await client
      .from("orders")
      .select("discount_code,discount_total_cents,ref_affiliate_code,ref_affiliate_user_id")
      .eq("user_id", userId)
      .limit(50);
    for (const o of (data ?? []) as OrderSignal[]) {
      if (
        (typeof o.discount_code === "string" && o.discount_code.trim().length > 0) ||
        (o.discount_total_cents ?? 0) > 0 ||
        o.ref_affiliate_code ||
        o.ref_affiliate_user_id
      ) {
        return true;
      }
    }
  } catch (error) {
    console.error("hasRedeemedDiscount: order read failed", error);
  }

  try {
    const { data } = await client
      .from("subscriptions")
      .select("ref_affiliate_code,ref_affiliate_user_id")
      .eq("user_id", userId)
      .limit(20);
    for (const s of (data ?? []) as SubSignal[]) {
      if (s.ref_affiliate_code || s.ref_affiliate_user_id) return true;
    }
  } catch (error) {
    console.error("hasRedeemedDiscount: subscription read failed", error);
  }

  // A referral stamped on the profile BEFORE any purchase: web signup capture,
  // the extension's carried code, or the desktop app's deep-link code. These
  // customers are entitled to the affiliate's discount at checkout, so a member
  // code on top would stack.
  if ((await referringAffiliateCode(client, userId)) !== null) return true;

  return false;
}

/**
 * The referring affiliate's code stamped on this user's profile (first-touch,
 * from web signup, the Chrome extension or the desktop app). Returns null when
 * the user was not referred, and "" when referred but the code is not recorded
 * (so check `!== null`, not truthiness). Best-effort
 * like the rest of this file: a read error (e.g. schema lag) reads as "no
 * referral" so callers fail open to their prior behavior.
 */
export async function referringAffiliateCode(
  client: FromClient,
  userId: string,
): Promise<string | null> {
  try {
    const { data } = await client
      .from("profiles")
      .select("ref_affiliate_code,ref_affiliate_user_id")
      .eq("id", userId)
      .limit(1);
    for (const p of (data ?? []) as SubSignal[]) {
      if (p.ref_affiliate_user_id || p.ref_affiliate_code) {
        return p.ref_affiliate_code?.trim() || "";
      }
    }
  } catch (error) {
    console.error("referringAffiliateCode: profile read failed", error);
  }
  return null;
}
