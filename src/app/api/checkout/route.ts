import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";

type CheckoutRequestBody = {
  variantId?: string;
  email?: string;
  userId?: string;
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
    const { variantId, email, userId } = (await request.json()) as CheckoutRequestBody;

    if (!variantId) {
      return NextResponse.json({ error: "Missing variantId" }, { status: 400 });
    }

    if (!email || !userId) {
      return NextResponse.json({ error: "Missing user info" }, { status: 400 });
    }

    const storeId = process.env.LEMONSQUEEZY_STORE_ID;

    if (!storeId) {
      console.error("Missing Lemon Squeezy store configuration");
      return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
    }

    const lsResponse = await lsApi("/checkouts", {
      method: "POST",
      body: JSON.stringify({
        data: {
          type: "checkouts",
          attributes: {
            checkout_data: {
              email,
              custom: {
                supabase_user_id: userId,
              },
            },
          },
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

    const checkoutUrl = payload.data?.attributes?.url;

    if (!checkoutUrl) {
      console.error("Checkout URL missing from Lemon Squeezy response");
      return NextResponse.json({ error: "Invalid checkout response" }, { status: 502 });
    }

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    console.error("Checkout API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
