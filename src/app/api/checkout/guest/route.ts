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

/**
 * Marketing pages that load lemon.js call this route with
 * `Accept: application/json` so they can open the LS overlay instead of
 * navigating. Plain <a href> clicks (or JS-disabled browsers) get the 302
 * fallback — same URL, different response shape based on the Accept header.
 */
function wantsJson(request: Request): boolean {
  const accept = request.headers.get("accept") ?? "";
  return accept.includes("application/json");
}

function errorResponse(request: Request, code: string): NextResponse {
  if (wantsJson(request)) {
    return NextResponse.json({ error: code }, { status: 502 });
  }
  const target = new URL("/", request.url);
  target.hash = `pricing?checkout_error=${code}`;
  return NextResponse.redirect(target);
}

/**
 * Payment-first guest checkout. Unauthenticated visitors hitting a marketing
 * CTA land here; we mint an LS checkout session (no email pre-fill, no
 * supabase_user_id) and either 302 the browser to LS or return the URL as
 * JSON (for the overlay modal). Account provisioning happens later, from the
 * LS webhook when the order completes.
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
        return errorResponse(request, `missing-env-${variantResolution.envVar}`);
      }
      return errorResponse(request, "bad-plan");
    }
    const { variantId } = variantResolution;

    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) {
      console.error("guest checkout: missing LEMONSQUEEZY_STORE_ID env var");
      return errorResponse(request, "missing-store-id");
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
      return errorResponse(request, `ls-${lsResponse.status}`);
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
      return errorResponse(request, "bad-json");
    }

    const rawCheckoutUrl = payload.data?.attributes?.url;
    if (!rawCheckoutUrl) {
      console.error("Guest checkout URL missing from LS response", {
        bodyPreview: rawBody.slice(0, 500),
      });
      return errorResponse(request, "no-url");
    }

    const checkoutUrl = affiliate
      ? appendAffRef(rawCheckoutUrl, affiliate.lsAffiliateId)
      : rawCheckoutUrl;

    if (wantsJson(request)) {
      return NextResponse.json({ checkoutUrl });
    }
    return NextResponse.redirect(checkoutUrl, { status: 302 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Guest checkout API error", error);
    // Common: lsApi throws "Missing LEMONSQUEEZY_API_KEY" if that env is unset.
    if (message.includes("LEMONSQUEEZY_API_KEY")) {
      return errorResponse(request, "missing-api-key");
    }
    return errorResponse(request, "unhandled");
  }
}
