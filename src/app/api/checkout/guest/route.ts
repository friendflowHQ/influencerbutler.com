import { NextResponse } from "next/server";
import { lsApi, resolveVariantId } from "@/lib/lemonsqueezy";
import { appendAffRef, lookupAffiliateByCode, withTimeout } from "@/lib/affiliate-lookup";

type LsCheckoutResponse = {
  data?: {
    attributes?: {
      url?: string;
    };
  };
};

function errorRedirect(request: Request, code: string): NextResponse {
  const target = new URL("/", request.url);
  target.hash = `pricing?checkout_error=${code}`;
  return NextResponse.redirect(target);
}

/**
 * Payment-first guest checkout. Unauthenticated visitors hitting a marketing
 * CTA land here; we mint an LS checkout session (no email pre-fill, no
 * supabase_user_id) and 302 the browser to LS. Account provisioning happens
 * later, from the LS webhook when the order completes.
 *
 * Using GET + 302 so plain <a href> tags on static HTML pages work without JS.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const plan = url.searchParams.get("plan") ?? undefined;
    const variantIdFromQuery = url.searchParams.get("variantId") ?? undefined;
    const rawCode = url.searchParams.get("code") ?? "";

    const variantResolution = resolveVariantId(plan ?? undefined, variantIdFromQuery ?? undefined);

    if (!variantResolution.ok) {
      if (variantResolution.reason === "missing-env") {
        console.error("guest checkout: missing variant env var", {
          envVar: variantResolution.envVar,
          plan,
        });
        return errorRedirect(request, `missing-env-${variantResolution.envVar}`);
      }
      return errorRedirect(request, "bad-plan");
    }
    const { variantId } = variantResolution;

    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) {
      console.error("guest checkout: missing LEMONSQUEEZY_STORE_ID env var");
      return errorRedirect(request, "missing-store-id");
    }

    const code = rawCode.trim();
    const affiliate =
      code.length > 0 ? await withTimeout(lookupAffiliateByCode(code), 3000, null) : null;

    const siteUrl =
      process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

    // Omit checkout_data entirely when there's nothing to put in it. An empty
    // {} object was rejected by LS in production with 404 (though local LS
    // tenants accepted it). Only include the key if we have an affiliate code
    // to pass through.
    const checkoutAttributes: Record<string, unknown> = {
      product_options: {
        redirect_url: `${siteUrl.replace(/\/$/, "")}/welcome`,
      },
    };
    if (affiliate) {
      checkoutAttributes.checkout_data = { discount_code: affiliate.code };
    }

    const lsResponse = await lsApi("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: checkoutAttributes,
          relationships: {
            store: {
              data: { type: "stores", id: storeId },
            },
            variant: {
              data: { type: "variants", id: variantId },
            },
          },
        },
      }),
    });

    const rawBody = await lsResponse.text();

    if (!lsResponse.ok) {
      console.error("Lemon Squeezy guest checkout creation failed", {
        status: lsResponse.status,
        statusText: lsResponse.statusText,
        bodyPreview: rawBody.slice(0, 500),
        variantId,
      });
      // Stash a slug of the LS body into the redirect so we can see the real
      // reason without needing Vercel log access. Also echo the store+variant
      // IDs we actually sent, so we can tell whether the deploy picked up the
      // latest env vars.
      const slug = rawBody.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 300);
      return errorRedirect(
        request,
        `ls-${lsResponse.status}-store${storeId}-var${variantId}-${slug}`,
      );
    }

    let payload: LsCheckoutResponse;
    try {
      payload = JSON.parse(rawBody) as LsCheckoutResponse;
    } catch (parseError) {
      console.error("Lemon Squeezy guest response was not valid JSON", {
        status: lsResponse.status,
        bodyPreview: rawBody.slice(0, 500),
        parseError: parseError instanceof Error ? parseError.message : String(parseError),
      });
      return errorRedirect(request, "bad-json");
    }

    const rawCheckoutUrl = payload.data?.attributes?.url;
    if (!rawCheckoutUrl) {
      console.error("Guest checkout URL missing from LS response", {
        bodyPreview: rawBody.slice(0, 500),
      });
      return errorRedirect(request, "no-url");
    }

    const checkoutUrl = affiliate
      ? appendAffRef(rawCheckoutUrl, affiliate.lsAffiliateId)
      : rawCheckoutUrl;

    return NextResponse.redirect(checkoutUrl, { status: 302 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Guest checkout API error", error);
    // Common: lsApi throws "Missing LEMONSQUEEZY_API_KEY" if that env is unset.
    if (message.includes("LEMONSQUEEZY_API_KEY")) {
      return errorRedirect(request, "missing-api-key");
    }
    return errorRedirect(request, "unhandled");
  }
}
