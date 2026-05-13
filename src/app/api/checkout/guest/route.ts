import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { lsApi, resolveVariantId } from "@/lib/lemonsqueezy";
import { appendAffRef, lookupAffiliateByCode, withTimeout } from "@/lib/affiliate-lookup";
import {
  WELCOME_TOKEN_COOKIE,
  WELCOME_TOKEN_COOKIE_MAX_AGE_SECONDS,
  generateWelcomeToken,
} from "@/lib/welcome-token";
import { readPromoTier, resolvePromoCode, writePromoCookies } from "@/lib/promo";

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
 * Sets the welcome-token cookie on the response. Used so the /welcome page
 * can identify the buyer post-redirect without requiring auth (see
 * src/lib/welcome-token.ts for the full flow).
 *
 * HttpOnly + SameSite=Lax + Secure-in-prod: the cookie survives the LS
 * round-trip (Lax allows top-level navigations back to our domain), but JS
 * on our pages can't read it — only /api/welcome/license can exchange it for
 * license data.
 */
function attachWelcomeTokenCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: WELCOME_TOKEN_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: WELCOME_TOKEN_COOKIE_MAX_AGE_SECONDS,
  });
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

    // One discount per purchase: affiliate code wins if present, otherwise
    // fall back to the cookie-tiered WELCOME promo. The pricing page UI
    // surfaces this rule so it's not surprising.
    const cookieStore = await cookies();
    const promoTier = readPromoTier(cookieStore);
    const promoCode = affiliate ? null : resolvePromoCode(promoTier);

    const siteUrl =
      process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";

    // Welcome-token: per-purchase UUID we set as a cookie + pass through LS
    // as custom_data so the /welcome page can identify the buyer without auth.
    // See src/lib/welcome-token.ts.
    const welcomeToken = generateWelcomeToken();

    const checkoutData: Record<string, unknown> = {
      custom: { welcome_token: welcomeToken },
    };
    if (affiliate) {
      checkoutData.discount_code = affiliate.code;
    } else if (promoCode) {
      checkoutData.discount_code = promoCode;
    }

    const checkoutAttributes: Record<string, unknown> = {
      checkout_data: checkoutData,
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
      const jsonResponse = NextResponse.json({ checkoutUrl });
      attachWelcomeTokenCookie(jsonResponse, welcomeToken);
      writePromoCookies(jsonResponse, cookieStore);
      return jsonResponse;
    }
    const redirectResponse = NextResponse.redirect(checkoutUrl, { status: 302 });
    attachWelcomeTokenCookie(redirectResponse, welcomeToken);
    writePromoCookies(redirectResponse, cookieStore);
    return redirectResponse;
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
