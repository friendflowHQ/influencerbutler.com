import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OfferResponse = {
  tier: "20" | "30" | "50" | null;
  code: string | null;
};

const STATIC_CODE_20 = "AFFNEWBIE20";
const STATIC_CODE_30 = "AFFBOOST30";

const MS_1H = 60 * 60 * 1000;
const MS_3D = 3 * 24 * 60 * 60 * 1000;
const MS_5D = 5 * 24 * 60 * 60 * 1000;

type QueryClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
      };
    };
  };
};

export async function GET() {
  const cookieStore = await cookies();

  // Auth via cookie-bound client (respects RLS for the call that fetches the
  // current user).
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_CIxsGcwPAdC470Jw8QQGMw_Tvw41zM-",
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // read-only
        },
      },
    },
  ) as unknown as {
    auth: { getUser: () => Promise<{ data: { user: { id?: string } | null } }> };
  };

  let userId: string | null = null;
  try {
    const {
      data: { user },
    } = await authClient.auth.getUser();
    userId = user?.id ?? null;
  } catch (error) {
    console.error("affiliate-offer: auth.getUser threw", error);
  }

  if (!userId) {
    return NextResponse.json({ tier: null, code: null } satisfies OfferResponse, { status: 200 });
  }

  // Query via service-role so we can look across subscriptions/orders without
  // relying on RLS.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://khutiiojhafblabtixpp.supabase.co";
  if (!serviceKey) {
    return NextResponse.json({ tier: null, code: null } satisfies OfferResponse, { status: 200 });
  }

  const svc = createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // stateless
      },
    },
  }) as unknown as QueryClient;

  // 1) Affiliate application must be approved.
  const { data: appData } = await svc
    .from("affiliate_applications")
    .select("status,reviewed_at,unique_discount_code_50")
    .eq("user_id", userId)
    .maybeSingle();

  const app = appData as
    | { status?: string; reviewed_at?: string | null; unique_discount_code_50?: string | null }
    | null;

  if (!app || app.status !== "approved" || !app.reviewed_at) {
    return NextResponse.json({ tier: null, code: null } satisfies OfferResponse);
  }

  // 2) If the affiliate has purchased, hide the banner.
  const { data: subs } = await svc.from("subscriptions").select("user_id").eq("user_id", userId).limit(1);
  if (Array.isArray(subs) && subs.length > 0) {
    return NextResponse.json({ tier: null, code: null } satisfies OfferResponse);
  }
  const { data: orders } = await svc.from("orders").select("user_id").eq("user_id", userId).limit(1);
  if (Array.isArray(orders) && orders.length > 0) {
    return NextResponse.json({ tier: null, code: null } satisfies OfferResponse);
  }

  // 3) Compute active tier from age.
  const approvedAt = new Date(app.reviewed_at).getTime();
  if (!Number.isFinite(approvedAt)) {
    return NextResponse.json({ tier: null, code: null } satisfies OfferResponse);
  }
  const age = Date.now() - approvedAt;

  if (age >= MS_5D && app.unique_discount_code_50) {
    return NextResponse.json({ tier: "50", code: app.unique_discount_code_50 } satisfies OfferResponse);
  }
  if (age >= MS_3D) {
    return NextResponse.json({ tier: "30", code: STATIC_CODE_30 } satisfies OfferResponse);
  }
  if (age >= MS_1H) {
    return NextResponse.json({ tier: "20", code: STATIC_CODE_20 } satisfies OfferResponse);
  }

  return NextResponse.json({ tier: null, code: null } satisfies OfferResponse);
}
