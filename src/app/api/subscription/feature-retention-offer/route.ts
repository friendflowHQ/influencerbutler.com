import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { lsApi } from "@/lib/lemonsqueezy";
import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";
import { createAdminClient } from "@/lib/supabase/admin";

// Accept-path for the in-funnel "what are you missing / what's broken?" offer
// shown only for missing_features/technical_issues cancel reasons
// (CancelFunnel.tsx Step4FeatureOffer). Unlike /api/subscription/retention-offer
// (a percent-off discount for a currently-dead screen), this is a fixed
// 2-months-free offer and never cancels the subscription - accepting it keeps
// the customer live.

export const runtime = "nodejs";

const FREE_MONTHS = 2;
const ALLOWED_REASONS = new Set(["missing_features", "technical_issues"]);

type OfferRequestBody = {
  subscriptionId?: string;
  variantId?: string;
  reason?: string;
  offerFeedback?: string | null;
};

type VariantAttributes = {
  interval?: string;
};

type VariantResponse = {
  data?: { attributes?: VariantAttributes };
};

function formatCurrency(amountCents: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(
      amountCents / 100,
    );
  } catch {
    return `$${(amountCents / 100).toFixed(2)}`;
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OfferRequestBody;
    const subscriptionId = body.subscriptionId?.toString();
    const variantId = body.variantId?.toString();
    const reason = body.reason?.toString() ?? "";
    const offerFeedback = body.offerFeedback?.toString().trim() || null;

    if (!subscriptionId || !variantId) {
      return NextResponse.json(
        { error: "Missing subscriptionId or variantId" },
        { status: 400 },
      );
    }

    if (!ALLOWED_REASONS.has(reason)) {
      return NextResponse.json(
        { error: "This offer is only available for missing_features/technical_issues" },
        { status: 400 },
      );
    }

    // Authenticate the caller and confirm they own this subscription.
    const cookieStore = await cookies();
    const userClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // No-op: route handler doesn't refresh cookies.
          },
        },
      },
    );

    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // The subscriptions table has RLS enabled with no SELECT policy, so the
    // anon/ssr user client reads back empty even for the owner's own rows.
    // Read the ownership row with the service-role client, still keyed by both
    // ls_subscription_id and the authenticated user_id so a caller can only
    // confirm a subscription that is actually theirs.
    const admin = createAdminClient();
    const { data: ownRow } = await admin
      .from("subscriptions")
      .select("id,user_id,ls_subscription_id,ls_variant_id")
      .eq("ls_subscription_id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownRow) {
      return NextResponse.json(
        { error: "Subscription not found for this user" },
        { status: 404 },
      );
    }

    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) {
      console.error("Missing LEMONSQUEEZY_STORE_ID");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    // 1. Look up the variant to confirm it's billed monthly - "2 months free"
    // has no clean equivalent on an annual plan, so we refuse rather than guess.
    const variantResponse = await lsApi(`/variants/${variantId}`, { method: "GET" });
    if (!variantResponse.ok) {
      const text = await variantResponse.text();
      console.error("Variant lookup failed", { status: variantResponse.status, text });
      return NextResponse.json({ error: "Could not load variant information" }, { status: 502 });
    }

    const variantPayload = (await variantResponse.json()) as VariantResponse;
    const interval = variantPayload.data?.attributes?.interval ?? null;

    if (interval !== "month") {
      return NextResponse.json(
        { error: "2 months free is only available on monthly plans" },
        { status: 400 },
      );
    }

    // 2. Create a 100%-off, single-use discount scoped to this variant, recurring
    // for FREE_MONTHS cycles so it doesn't re-bill starting month 2.
    const discount = await createUniqueDiscount({
      storeId,
      percentOff: 100,
      namePrefix: "FEATUREOFFER",
      durationMonths: FREE_MONTHS,
      variantIds: [variantId],
      name: `Feature/issue retention offer for subscription ${subscriptionId}`,
    });

    if (!discount) {
      return NextResponse.json({ error: "Could not create retention offer" }, { status: 502 });
    }

    // 3. Attempt to apply the discount to the existing subscription.
    let applied = false;
    let customerPortalUrl: string | null = null;

    const patchResponse = await lsApi(`/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "subscriptions",
          id: subscriptionId,
          relationships: {
            discount: {
              data: { type: "discounts", id: discount.discountId },
            },
          },
        },
      }),
    });

    if (patchResponse.ok) {
      applied = true;
    } else {
      const text = await patchResponse.text();
      console.warn("Subscription discount assignment failed, falling back to code", {
        status: patchResponse.status,
        text,
      });

      const subResponse = await lsApi(`/subscriptions/${subscriptionId}`, { method: "GET" });
      if (subResponse.ok) {
        const subData = (await subResponse.json()) as {
          data?: { attributes?: { urls?: { customer_portal?: string } } };
        };
        customerPortalUrl = subData.data?.attributes?.urls?.customer_portal ?? null;
      }
    }

    // 4. Log the row - the real reason, server-validated above, so the admin
    // "feature & issue requests" view can trust it. No Lemon Squeezy cancel
    // call happens anywhere in this route: the subscription stays live.
    await admin.from("subscription_cancel_reasons").insert({
      user_id: user.id,
      subscription_id: subscriptionId,
      reason,
      offer_feedback: offerFeedback,
      source: "in_app",
      offer_shown: true,
      offer_accepted: true,
    });

    return NextResponse.json({
      ok: true,
      applied,
      discountCode: discount.code,
      customerPortalUrl,
      freeMonths: FREE_MONTHS,
      nextChargeFormatted: formatCurrency(0),
    });
  } catch (error) {
    console.error("feature-retention-offer error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
