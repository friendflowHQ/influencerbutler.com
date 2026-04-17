import { NextResponse } from "next/server";
import { lsApi, resolveVariantId } from "@/lib/lemonsqueezy";
import { appendAffRef, lookupAffiliateByCode, withTimeout } from "@/lib/affiliate-lookup";
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
