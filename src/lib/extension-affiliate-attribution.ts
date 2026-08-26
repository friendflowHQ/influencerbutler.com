import { lookupAffiliateOwnerByCode } from "@/lib/affiliate-lookup";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Records the referring affiliate when a user connects their license key in the
 * Chrome extension, from an affiliate code the extension captured on an earlier
 * influencerbutler.com visit (the ib_aff_src cookie / ?code= param) and kept in
 * storage.local.
 *
 * This is the extension's answer to the 30-day-cookie gap: the web cookie that
 * normally carries the affiliate to checkout (src/lib/promo.ts) expires after 30
 * days and never leaves the browser it was set in, so a creator who clicks an
 * affiliate link, installs the free extension, and only converts weeks later (or
 * on another device) would otherwise credit nobody. The extension carries the
 * code durably and hands it over here, at the one moment it has a real license
 * key to tie it to an account.
 *
 * Two things happen, mirroring the two existing attribution surfaces:
 *   1. profiles.ref_* first-touch stamp (like captureSignupReferral) so the
 *      affiliate dashboard counts this account as referred.
 *   2. Retroactive back-attribution of the user's already-paid, un-attributed
 *      orders (like the admin-attribute-order tool) so the owed-commissions
 *      report actually pays out for a conversion that happened before the key
 *      was connected. This is the load-bearing half: the owed report reads
 *      orders.ref_affiliate_user_id + attribution_status='pending', NOT
 *      profiles.ref_*.
 *
 * Guards, matching the rest of the affiliate code:
 *   - Only stamps codes that resolve to a real affiliate profile.
 *   - Self-referral is ignored.
 *   - First-touch: never overwrites an existing profile stamp, and never
 *     re-attributes an order already credited to a DIFFERENT affiliate.
 *   - Causal: an order is only back-attributed when it was created at or after
 *     the code was captured, so an affiliate can never claim a purchase the
 *     creator made before ever seeing their link.
 *
 * Best-effort by design: every failure is logged and swallowed so connecting a
 * license key in the extension is never blocked by attribution.
 */

// Branded affiliate codes are short alphanumeric slugs (e.g. "KAY"). Anything
// else is junk from a tampered client and is rejected before any DB work.
const CODE_RE = /^[A-Za-z0-9_-]{1,64}$/;

// Clock-skew tolerance for the causal guard: an order created up to this long
// BEFORE the capture timestamp still counts as "after" the referral, so a
// same-session click-then-buy (where the purchase can beat the stored capture
// time by seconds) is not excluded.
const CAPTURE_SKEW_MS = 10 * 60 * 1000;

type OrderRow = {
  ls_order_id: string | null;
  status: string | null;
  attribution_status: string | null;
  ref_affiliate_user_id: string | null;
  created_at: string | null;
};

/** Lead source recorded on the referral. Defaults to the extension; the desktop
 *  app reuses this same function with "desktop" (Phase 2). */
export type ReferralChannel = "extension" | "desktop";

export async function attributeExtensionReferral(args: {
  userId: string;
  userEmail: string | null;
  code: string;
  /** When the extension captured the code (epoch ms), for the causal guard on
   *  order back-attribution. Null skips back-attribution (profiles-only). */
  capturedAtMs: number | null;
  /** Which client carried the code. Defaults to "extension". */
  channel?: ReferralChannel;
}): Promise<void> {
  try {
    const code = args.code.trim();
    if (!code || !CODE_RE.test(code)) return;

    const owner = await lookupAffiliateOwnerByCode(code);
    if (!owner) return;

    // Self-referral guard.
    if (owner.affiliateUserId === args.userId) return;

    const admin = createAdminClient();
    const affiliateCode = owner.code.toUpperCase();

    await stampProfile(
      admin,
      args.userId,
      owner.affiliateUserId,
      affiliateCode,
      args.channel ?? "extension",
    );
    await backAttributeOrders(
      admin,
      args.userId,
      owner.affiliateUserId,
      affiliateCode,
      args.capturedAtMs,
    );
  } catch (err) {
    console.warn("ext-affiliate: attribution skipped", err);
  }
}

/**
 * First-touch stamp on the referred customer's own profile. Uses update (not
 * upsert): the account exists (it owns the license key we just resolved), so we
 * never risk the profiles.email NOT NULL trap that an upsert-with-null-email
 * would hit. The `.is(ref_affiliate_user_id, null)` guard makes it first-touch
 * at the database, so a concurrent request cannot clobber an earlier stamp.
 */
async function stampProfile(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  affiliateUserId: string,
  affiliateCode: string,
  channel: ReferralChannel,
): Promise<void> {
  const base = {
    ref_affiliate_user_id: affiliateUserId,
    ref_affiliate_code: affiliateCode,
    ref_captured_at: new Date().toISOString(),
  };
  const { error } = await admin
    .from("profiles")
    .update({ ...base, ref_channel: channel })
    .eq("id", userId)
    .is("ref_affiliate_user_id", null);
  if (error) {
    // A pre-20260826 prod lacks ref_channel; retry without it so the referral
    // is still stamped (the funnel then labels these events "web"). Non-fatal
    // either way: order back-attribution below is what actually pays out.
    console.warn("ext-affiliate: profile stamp retrying without ref_channel", error);
    const { error: retryErr } = await admin
      .from("profiles")
      .update(base)
      .eq("id", userId)
      .is("ref_affiliate_user_id", null);
    if (retryErr) {
      console.warn("ext-affiliate: profile stamp skipped", retryErr);
    }
  }
}

/**
 * Retroactively attribute the user's paid, un-attributed orders to the
 * affiliate, so a conversion that happened before the key was connected still
 * pays. Mirrors admin-attribute-order's write (ref_* + attribution_status=
 * 'pending'), with a causal guard: only orders created at/after the code was
 * captured qualify.
 */
async function backAttributeOrders(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  affiliateUserId: string,
  affiliateCode: string,
  capturedAtMs: number | null,
): Promise<void> {
  // Without a capture time we cannot enforce the causal guard, so we do not
  // touch historical orders (the profile stamp above still credits future
  // conversions and the dashboard).
  if (capturedAtMs == null || !Number.isFinite(capturedAtMs)) return;
  const floorMs = capturedAtMs - CAPTURE_SKEW_MS;

  const { data, error } = await admin
    .from("orders")
    .select("ls_order_id,status,attribution_status,ref_affiliate_user_id,created_at")
    .eq("user_id", userId);
  if (error) {
    console.warn("ext-affiliate: orders lookup skipped", error);
    return;
  }

  const rows = (data ?? []) as OrderRow[];
  for (const o of rows) {
    if (!o.ls_order_id) continue;
    if (o.status !== "paid") continue;

    const existing = o.ref_affiliate_user_id;
    if (existing === affiliateUserId) continue; // already ours
    if (existing) continue; // credited to a different affiliate: never steal

    // Causal guard: the referral must precede (or coincide with) the purchase.
    const createdMs = o.created_at ? Date.parse(o.created_at) : NaN;
    if (Number.isNaN(createdMs) || createdMs < floorMs) continue;

    const { error: updErr } = await admin
      .from("orders")
      .update({
        ref_affiliate_user_id: affiliateUserId,
        ref_affiliate_code: affiliateCode,
        attribution_status: "pending",
      })
      .eq("ls_order_id", o.ls_order_id)
      .is("ref_affiliate_user_id", null);
    if (updErr) {
      console.warn("ext-affiliate: order back-attribute failed", o.ls_order_id, updErr);
    }
  }
}
