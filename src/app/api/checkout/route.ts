import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { lsApi, resolveVariantId, isAddonVariant } from "@/lib/lemonsqueezy";
import { appendAffRef } from "@/lib/affiliate-lookup";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  readAffiliateSourceCookie,
  readPromoTier,
  writeAffiliateSourceCookieIfMissing,
  writePromoCookies,
} from "@/lib/promo";
import { resolveCheckoutDiscount, affiliateCaptureCustom } from "@/lib/promo-resolver";
import { planMetaFor } from "@/lib/pricing-constants";
import { readGeo, upsertCheckoutGeo } from "@/lib/recent-activity";

type CheckoutRequestBody = {
  plan?: string;
  variantId?: string;
  code?: string;
  /**
   * Set by the pricing / subscription pages on first ?code= visit so we can
   * still credit the affiliate even if the user overwrites the promo input.
   * Falls back to the ib_aff_src cookie when not supplied.
   */
  affiliateSource?: string;
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
      affiliateSource: rawAffiliateSource,
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

    // Phase F belt 1: Daily Deals Workspace add-on never accepts promo or
    // affiliate codes. Compute the flag once and short-circuit every
    // discount path below. Belt 2 lives in /api/checkout/guest/route.ts;
    // belt 3 lives in src/lib/lemonsqueezy-discounts.ts variantIds scope.
    const isAddon = isAddonVariant(variantId);

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

    // Guard against accidental double-subscription: a user who already has an
    // active (paid) subscription must not create a second parallel one via a
    // fresh checkout (that would double-bill them and mint a second license).
    // They should upgrade in-app instead (/dashboard/subscription -> Switch to
    // annual). Deliberately NOT blocked:
    //   - on_trial: the trial-conversion email converts trials via a fresh
    //     annual checkout carrying the user's personal discount code.
    //   - the Daily Deals add-on: a legitimate second, additive subscription.
    // The guest checkout route (/api/checkout/guest) is exempt by nature:
    // guests have no session and therefore no existing subscription.
    if (!isAddon) {
      // Service-role read: the subscriptions table has no anon/authenticated
      // SELECT policy, so the RLS client returns nothing here. The user is
      // already authenticated above, and we key the lookup by their own userId.
      const { data: activeSub } = await createAdminClient()
        .from("subscriptions")
        .select("ls_subscription_id")
        .eq("user_id", userId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (activeSub) {
        return NextResponse.json(
          {
            error:
              "You already have an active subscription. Manage or switch your plan from your dashboard.",
            code: "already_subscribed",
          },
          { status: 409 },
        );
      }
    }

    const cookieStore = await cookies();
    const cookieTier = readPromoTier(cookieStore);
    const typedCode = typeof rawCode === "string" ? rawCode.trim() : "";
    const urlCode =
      (typeof rawAffiliateSource === "string" && rawAffiliateSource.trim().length > 0
        ? rawAffiliateSource.trim()
        : null) ?? readAffiliateSourceCookie(cookieStore);

    // Belt 1: when the variant is an add-on, skip the entire resolver call
    // so no discount or attribution can attach to the checkout. The
    // appendAffRef path below also has its own isAddon guard.
    //
    // Best-code wins discount, first-touch affiliate gets aff_ref (independent).
    // The plan metadata (price + interval) is required to compute lifetime $ value
    // across candidates; we treat unknown plans like a 1-cycle no-op horizon.
    const planMeta = planMetaFor(plan) ?? { priceCents: 0, interval: "month" };

    const resolved: Awaited<ReturnType<typeof resolveCheckoutDiscount>> = isAddon
      ? { winner: null, attribution: null, intendedAffiliate: null, candidates: [] }
      : await resolveCheckoutDiscount({
          typedCode: typedCode.length > 0 ? typedCode : null,
          urlCode,
          cookieTier,
          plan: planMeta,
          storeId,
        });

    const discountCode = resolved.winner?.code;

    const siteUrl =
      process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

    // Stash the buyer's approximate location for the recent-activity widget,
    // keyed by user id (authed checkout carries no welcome_token). The
    // order_created webhook reads it back. Best-effort, fire-and-forget.
    void upsertCheckoutGeo(`user:${userId}`, readGeo(request.headers));

    const checkoutAttributes: Record<string, unknown> = {
      checkout_data: {
        email,
        discount_code: discountCode,
        custom: {
          supabase_user_id: userId,
          // Capture the intended affiliate even when LS can't be credited yet
          // (pre-activation gap). order_created persists these onto the order.
          ...affiliateCaptureCustom(resolved.intendedAffiliate),
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

    // Belt 1 cont.: add-on checkouts never get an aff_ref query param either,
    // so the affiliate doesn't earn commission on the add-on SKU.
    const checkoutUrl = !isAddon && resolved.attribution
      ? appendAffRef(rawCheckoutUrl, resolved.attribution.lsAffiliateId)
      : rawCheckoutUrl;

    const jsonResponse = NextResponse.json({
      checkoutUrl,
      discountApplied: discountCode ?? null,
      savingsCents: resolved.winner?.savedCents ?? 0,
      attributionCode: resolved.attribution?.sourceCode ?? null,
    });
    writePromoCookies(jsonResponse, cookieStore);
    writeAffiliateSourceCookieIfMissing(jsonResponse, cookieStore, urlCode);
    return jsonResponse;
  } catch (error) {
    console.error("Checkout API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
