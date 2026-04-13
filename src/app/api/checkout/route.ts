import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";
import { createClient } from "@/lib/supabase/server";

type CheckoutRequestBody = {
  variantId?: string;
};

type AuthUser = {
  id: string;
  email?: string | null;
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
    const supabase = await createClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    const user = authUser as AuthUser | null;

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { variantId } = (await request.json()) as CheckoutRequestBody;

    if (!variantId) {
      return NextResponse.json({ error: "Missing variantId" }, { status: 400 });
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
              email: user.email,
              custom: {
                supabase_user_id: user.id,
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
