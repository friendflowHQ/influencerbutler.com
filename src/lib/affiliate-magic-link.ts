// One-click sign-in link that drops an affiliate straight into their own
// payout settings, instead of the login-gated /dashboard/affiliates URL the
// tax/PayPal reminder normally links to.
//
// Mirrors the generate-link + custom-URL pattern in
// src/app/api/auth/login-link/route.ts: we never email Supabase's raw
// action_link, since email security scanners and link pre-fetchers (Outlook
// SafeLinks, antivirus, corporate proxies) burn it by simply GET-ing it,
// leaving the real user with "link already used". Instead we build a link to
// our own /auth/confirm page carrying the token_hash, redeemed only on a
// deliberate Confirm-button click a scanner never performs.
//
// Unlike login-link/route.ts, this never calls ensureUser: every affiliate
// already has an account, so there is nothing to auto-provision here.

import { adminService } from "@/lib/admin-service";

export async function generateAffiliateMagicLink(email: string): Promise<string | null> {
  const svc = adminService();
  if (!svc) return null;

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const base = siteUrl.replace(/\/$/, "");

  try {
    const { data, error } = await svc.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${base}/dashboard/affiliates` },
    });
    // hashed_token is returned at runtime but missing from the installed
    // @supabase/supabase-js property types, which only declare action_link.
    const hashedToken =
      (data?.properties as { hashed_token?: string } | undefined)?.hashed_token ?? null;
    if (error || !hashedToken) {
      console.error("generateAffiliateMagicLink: no link generated", { reason: error?.message });
      return null;
    }
    return `${base}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=magiclink&next=${encodeURIComponent("/dashboard/affiliates")}`;
  } catch (err) {
    console.error("generateAffiliateMagicLink failed", err);
    return null;
  }
}
