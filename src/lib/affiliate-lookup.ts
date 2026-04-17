import { createServerClient } from "@supabase/ssr";

type ProfileLookupClient = {
  from: (table: string) => {
    select: (cols: string) => {
      ilike: (col: string, value: string) => {
        limit: (n: number) => Promise<{
          data: { ls_affiliate_id?: string | null; affiliate_code?: string | null }[] | null;
          error: unknown;
        }>;
      };
    };
  };
};

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
 */
export async function lookupAffiliateByCode(
  code: string,
): Promise<{ lsAffiliateId: string; code: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "affiliate-lookup: SUPABASE_SERVICE_ROLE_KEY not set — cannot look up branded codes",
    );
    return null;
  }

  const svc = createServerClient(url, key, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // stateless
      },
    },
  }) as unknown as ProfileLookupClient;

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
