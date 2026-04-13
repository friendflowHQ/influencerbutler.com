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
  error?: {
    message?: string;
  };
};

export async function POST(request: Request) {
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
    return NextResponse.json({ error: "Missing store configuration" }, { status: 500 });
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
    return NextResponse.json(
      { error: payload.error?.message ?? "Failed to create checkout session" },
      { status: lsResponse.status },
    );
  }

  const checkoutUrl = payload.data?.attributes?.url;

  if (!checkoutUrl) {
    return NextResponse.json({ error: "Checkout URL missing from Lemon Squeezy response" }, { status: 502 });
  }

  return NextResponse.json({ checkoutUrl });
}
