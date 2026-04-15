import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";
import { createClient } from "@/lib/supabase/server";

type CheckoutRequestBody = {
  plan?: string;
  variantId?: string;
  code?: string;
};

type LsCheckoutResponse = {
  data?: {
    attributes?: {
      url?: string;
    };
  };
};

function resolveVariantId(plan: string | undefined, fallback: string | undefined): string | null {
  if (plan === "monthly") {
    return process.env.LEMONSQUEEZY_VARIANT_MONTHLY || null;
  }
  if (plan === "annual") {
    return process.env.LEMONSQUEEZY_VARIANT_ANNUAL || null;
  }
  if (fallback) {
    return fallback;
  }
  return null;
}

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

/**
 * Looks up the affiliate who owns a branded code. Case-insensitive. Returns
 * null if no match, or if the service-role key isn't configured.
 */
async function lookupAffiliateByCode(
  code: string,
): Promise<{ lsAffiliateId: string; code: string } | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("checkout: SUPABASE_SERVICE_ROLE_KEY not set — cannot look up branded codes");
    return null;
  }

  const { createServerClient } = await import("@supabase/ssr");
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
    console.error("checkout: affiliate code lookup failed", error);
    return null;
  }

  const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
  if (!row || !row.ls_affiliate_id || !row.affiliate_code) return null;

  return { lsAffiliateId: row.ls_affiliate_id, code: row.affiliate_code };
}

function appendAffRef(checkoutUrl: string, lsAffiliateId: string): string {
  try {
    const parsed = new URL(checkoutUrl);
    parsed.searchParams.set("aff_ref", lsAffiliateId);
    return parsed.toString();
  } catch {
    const separator = checkoutUrl.includes("?") ? "&" : "?";
    return `${checkoutUrl}${separator}aff_ref=${encodeURIComponent(lsAffiliateId)}`;
  }
}

export async function POST(request: Request) {
  try {
    const {
      plan,
      variantId: variantIdFromBody,
      code: rawCode,
    } = (await request.json()) as CheckoutRequestBody;

    const variantId = resolveVariantId(plan, variantIdFromBody);

    if (!variantId) {
      return NextResponse.json({ error: "Missing plan or variantId" }, { status: 400 });
    }

    const storeId = process.env.LEMONSQUEEZY_STORE_ID;

    if (!storeId) {
      console.error("Missing Lemon Squeezy store configuration");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user || !userData.user.email) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const email = userData.user.email;
    const userId = userData.user.id;

    // Resolve optional affiliate code — tolerate missing/invalid without erroring.
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const affiliate = code.length > 0 ? await lookupAffiliateByCode(code) : null;

    const checkoutAttributes: Record<string, unknown> = {
      checkout_data: {
        email,
        discount_code: affiliate ? affiliate.code : undefined,
        custom: {
          supabase_user_id: userId,
        },
      },
    };

    const lsResponse = await lsApi("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: checkoutAttributes,
          relationships: {
            store: {
              data: {
                type: "stores",
                id: storeId,
              },
            },
            variant: {
              data: {
                type: "variants",
                id: variantId,
              },
            },
          },
        },
      }),
    });

    const payload = (await lsResponse.json()) as LsCheckoutResponse;

    if (!lsResponse.ok) {
      console.error("Lemon Squeezy checkout creation failed", { status: lsResponse.status });
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 502 });
    }

    const rawCheckoutUrl = payload.data?.attributes?.url;

    if (!rawCheckoutUrl) {
      console.error("Checkout URL missing from Lemon Squeezy response");
      return NextResponse.json({ error: "Invalid checkout response" }, { status: 502 });
    }

    const checkoutUrl = affiliate
      ? appendAffRef(rawCheckoutUrl, affiliate.lsAffiliateId)
      : rawCheckoutUrl;

    return NextResponse.json({
      checkoutUrl,
      discountApplied: affiliate ? affiliate.code : null,
    });
  } catch (error) {
    console.error("Checkout API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
