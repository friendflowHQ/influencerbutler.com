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

type VariantResolution =
  | { ok: true; variantId: string }
  | { ok: false; reason: "missing-input" | "missing-env"; envVar?: string };

function resolveVariantId(plan: string | undefined, fallback: string | undefined): VariantResolution {
  if (plan === "monthly") {
    const id = process.env.LEMONSQUEEZY_VARIANT_MONTHLY;
    if (!id) return { ok: false, reason: "missing-env", envVar: "LEMONSQUEEZY_VARIANT_MONTHLY" };
    return { ok: true, variantId: id };
  }
  if (plan === "annual") {
    const id = process.env.LEMONSQUEEZY_VARIANT_ANNUAL;
    if (!id) return { ok: false, reason: "missing-env", envVar: "LEMONSQUEEZY_VARIANT_ANNUAL" };
    return { ok: true, variantId: id };
  }
  if (fallback) {
    return { ok: true, variantId: fallback };
  }
  return { ok: false, reason: "missing-input" };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
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

    const variantResolution = resolveVariantId(plan, variantIdFromBody);

    if (!variantResolution.ok) {
      if (variantResolution.reason === "missing-env") {
        console.error("checkout: missing variant env var", { envVar: variantResolution.envVar, plan });
        return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
      }
      return NextResponse.json({ error: "Missing plan or variantId" }, { status: 400 });
    }
    const { variantId } = variantResolution;

    const storeId = process.env.LEMONSQUEEZY_STORE_ID;

    if (!storeId) {
      console.error("checkout: missing LEMONSQUEEZY_STORE_ID env var");
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
    // Bounded to 3s so a Supabase hiccup can't cascade into a Vercel function timeout.
    const code = typeof rawCode === "string" ? rawCode.trim() : "";
    const affiliate =
      code.length > 0 ? await withTimeout(lookupAffiliateByCode(code), 3000, null) : null;

    const siteUrl =
      process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

    const checkoutAttributes: Record<string, unknown> = {
      checkout_data: {
        email,
        discount_code: affiliate ? affiliate.code : undefined,
        custom: {
          supabase_user_id: userId,
        },
      },
      product_options: {
        redirect_url: `${siteUrl.replace(/\/$/, "")}/welcome`,
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

    // Read body as text first so we can log it on failure; JSON-parse on success path.
    const rawBody = await lsResponse.text();

    if (!lsResponse.ok) {
      console.error("Lemon Squeezy checkout creation failed", {
        status: lsResponse.status,
        statusText: lsResponse.statusText,
        bodyPreview: rawBody.slice(0, 500),
        variantId,
      });
      return NextResponse.json({ error: "Failed to create checkout session" }, { status: 502 });
    }

    let payload: LsCheckoutResponse;
    try {
      payload = JSON.parse(rawBody) as LsCheckoutResponse;
    } catch (parseError) {
      console.error("Lemon Squeezy response was not valid JSON", {
        status: lsResponse.status,
        bodyPreview: rawBody.slice(0, 500),
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return NextResponse.json({ error: "Invalid checkout response" }, { status: 502 });
    }

    const rawCheckoutUrl = payload.data?.attributes?.url;

    if (!rawCheckoutUrl) {
      console.error("Checkout URL missing from Lemon Squeezy response", {
        bodyPreview: rawBody.slice(0, 500),
      });
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
