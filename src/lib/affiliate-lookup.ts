import { createServerClient } from "@supabase/ssr";

type ProfileLookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      ilike: (col: string, value: string) => {
        limit: (n: number) => Promise<{
          data:
            | {
                id?: string | null;
                ls_affiliate_id?: string | null;
                affiliate_code?: string | null;
              }[]
            | null;
          error: unknown;
        }>;
      };
    };
  };
};

function profileLookupClient(): ProfileLookupClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "affiliate-lookup: SUPABASE_SERVICE_ROLE_KEY not set - cannot look up branded codes",
    );
    return null;
  }
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // stateless
      },
    },
  }) as unknown as ProfileLookupClient;
}

/**
 * Self-hosted affiliate program flag. When enabled (the default), we track and
 * pay every affiliate ourselves and never hand referrals to Lemon Squeezy's
 * affiliate program: aff_ref is not appended at checkout, and every captured
 * referral is recorded as "pending" so the commission engine owes the full
 * promised rate. Set AFFILIATE_SELF_HOSTED="false" to fall back to the legacy
 * LS affiliate program (aff_ref + live-if-linked attribution).
 */
export function selfHostedAffiliatesEnabled(): boolean {
  return process.env.AFFILIATE_SELF_HOSTED !== "false";
}

export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Looks up the affiliate who owns a branded code. Case-insensitive. Returns
 * null if no match, or if the service-role key isn't configured.
 *
 * Linked-only contract: returns null when the matching profile has no
 * `ls_affiliate_id`. This is the live discount/attribution path - we must not
 * apply `aff_ref` (and thus pay commission) for an affiliate whose LS account
 * isn't wired up yet. For the capture path that needs the intended affiliate
 * BEFORE LS activation, use `lookupAffiliateOwnerByCode`.
 */
export async function lookupAffiliateByCode(
  code: string,
): Promise<{ lsAffiliateId: string; code: string } | null> {
  const svc = profileLookupClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("profiles")
    .select("ls_affiliate_id,affiliate_code")
    .ilike("affiliate_code", code)
    .limit(1);

  if (error) {
    console.error("affiliate-lookup: code lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row || !row.ls_affiliate_id || !row.affiliate_code) return null;

  return { lsAffiliateId: row.ls_affiliate_id, code: row.affiliate_code };
}

/**
 * Capture-path lookup: resolves the affiliate who owns a branded code
 * regardless of whether their LS account is activated yet. Returns the
 * affiliate's `user_id` (profiles.id) and a possibly-null `lsAffiliateId`.
 *
 * Used to durably record the *intended* affiliate on an order during the
 * pre-LS-activation gap, so the referral can be reconciled and paid once the
 * affiliate goes live. Distinct from `lookupAffiliateByCode`, which is the
 * linked-only live path and never returns unlinked affiliates.
 */
export async function lookupAffiliateOwnerByCode(
  code: string,
): Promise<{ affiliateUserId: string; lsAffiliateId: string | null; code: string } | null> {
  const svc = profileLookupClient();
  if (!svc) return null;

  const { data, error } = await svc
    .from("profiles")
    .select("id,ls_affiliate_id,affiliate_code")
    .ilike("affiliate_code", code)
    .limit(1);

  if (error) {
    console.error("affiliate-lookup: owner lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row || !row.id || !row.affiliate_code) return null;

  return {
    affiliateUserId: row.id,
    lsAffiliateId: row.ls_affiliate_id ?? null,
    code: row.affiliate_code,
  };
}

export function appendAffRef(checkoutUrl: string, lsAffiliateId: string): string {
  try {
    const parsed = new URL(checkoutUrl);
    parsed.searchParams.set("aff_ref", lsAffiliateId);
    return parsed.toString();
  } catch {
    const separator = checkoutUrl.includes("?") ? "&" : "?";
    return `${checkoutUrl}${separator}aff_ref=${encodeURIComponent(lsAffiliateId)}`;
  }
}
