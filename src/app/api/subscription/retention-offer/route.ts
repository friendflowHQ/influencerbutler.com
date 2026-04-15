import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";

type OfferRequestBody = {
  subscriptionId?: string;
  variantId?: string;
  reason?: string;
  feedback?: string;
};

type VariantAttributes = {
  price?: number;
  interval?: string;
  product_id?: number;
};

type VariantResponse = {
  data?: { id?: string; attributes?: VariantAttributes };
};

type DiscountResponse = {
  data?: {
    id?: string;
    attributes?: {
      code?: string;
      percent?: string | number;
    };
  };
};

function formatCurrency(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(amount);
  } catch {
    return `$${amount.toFixed(2)}`;
  }
}

function randomSuffix(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as OfferRequestBody;
    const subscriptionId = body.subscriptionId?.toString();
    const variantId = body.variantId?.toString();
    const reason = body.reason?.toString() ?? "retention_offer_accepted";
    const feedback = body.feedback?.toString() ?? null;

    if (!subscriptionId || !variantId) {
      return NextResponse.json(
        { error: "Missing subscriptionId or variantId" },
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

    const { data: ownRow } = await userClient
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
      return NextResponse.json(
        { error: "Server misconfiguration" },
        { status: 500 },
      );
    }

    // 1. Look up the variant to determine interval + offer parameters.
    const variantResponse = await lsApi(`/variants/${variantId}`, { method: "GET" });

    if (!variantResponse.ok) {
      const text = await variantResponse.text();
      console.error("Variant lookup failed", { status: variantResponse.status, text });
      return NextResponse.json(
        { error: "Could not load variant information" },
        { status: 502 },
      );
    }

    const variantPayload = (await variantResponse.json()) as VariantResponse;
    const variantAttrs = variantPayload.data?.attributes ?? {};
    const priceCents = typeof variantAttrs.price === "number" ? variantAttrs.price : null;
    const interval = typeof variantAttrs.interval === "string" ? variantAttrs.interval : null;

    if (priceCents == null || interval == null) {
      return NextResponse.json(
        { error: "Variant missing pricing info" },
        { status: 502 },
      );
    }

    let offerPercent: number;
    let durationInMonths: number;

    if (interval === "month") {
      offerPercent = 50;
      durationInMonths = 3;
    } else if (interval === "year") {
      offerPercent = 20;
      durationInMonths = 12;
    } else {
      return NextResponse.json(
        { error: `No retention offer for interval "${interval}"` },
        { status: 400 },
      );
    }

    const currency = "USD";
    const discountedCents = Math.round(priceCents * (1 - offerPercent / 100));

    // 2. Create a new discount in Lemon Squeezy scoped to this variant.
    const discountCode = `WINBACK-${subscriptionId}-${randomSuffix()}`;

    const discountResponse = await lsApi("/discounts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "discounts",
          attributes: {
            name: `Win-back offer for subscription ${subscriptionId}`,
            code: discountCode,
            amount: offerPercent,
            amount_type: "percent",
            duration: "repeating",
            duration_in_months: durationInMonths,
            is_limited_redemptions: true,
            max_redemptions: 1,
          },
          relationships: {
            store: {
              data: { type: "stores", id: storeId },
            },
            variants: {
              data: [{ type: "variants", id: variantId }],
            },
          },
        },
      }),
    });

    if (!discountResponse.ok) {
      const text = await discountResponse.text();
      console.error("Discount creation failed", {
        status: discountResponse.status,
        text,
      });
      return NextResponse.json(
        { error: "Could not create retention discount" },
        { status: 502 },
      );
    }

    const discountPayload = (await discountResponse.json()) as DiscountResponse;
    const discountId = discountPayload.data?.id ?? null;

    // 3. Attempt to apply the discount to the existing subscription.
    let applied = false;
    let customerPortalUrl: string | null = null;

    if (discountId) {
      const patchResponse = await lsApi(`/subscriptions/${subscriptionId}`, {
        method: "PATCH",
        body: JSON.stringify({
          data: {
            type: "subscriptions",
            id: subscriptionId,
            relationships: {
              discount: {
                data: { type: "discounts", id: discountId },
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

        // Fallback: surface the customer portal URL so the user can paste the code.
        const subResponse = await lsApi(`/subscriptions/${subscriptionId}`, {
          method: "GET",
        });
        if (subResponse.ok) {
          const subData = (await subResponse.json()) as {
            data?: { attributes?: { urls?: { customer_portal?: string } } };
          };
          customerPortalUrl = subData.data?.attributes?.urls?.customer_portal ?? null;
        }
      }
    }

    // 4. Log analytics row with service-role client.
    const serviceUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (serviceUrl && serviceKey) {
      const serviceClient = createServerClient(serviceUrl, serviceKey, {
        cookies: {
          getAll() {
            return [];
          },
          setAll() {
            // No-op
          },
        },
      });

      await serviceClient.from("subscription_cancel_reasons").insert({
        user_id: user.id,
        subscription_id: subscriptionId,
        reason,
        feedback,
        offer_shown: true,
        offer_accepted: true,
      });
    }

    return NextResponse.json({
      ok: true,
      applied,
      discountCode,
      customerPortalUrl,
      offerPercent,
      durationInMonths,
      discountedPriceFormatted: formatCurrency(discountedCents, currency),
      nextChargeFormatted: formatCurrency(discountedCents, currency),
    });
  } catch (error) {
    console.error("retention-offer error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
