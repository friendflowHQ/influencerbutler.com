import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";

type CancelRequestBody = {
  subscriptionId?: string;
  reason?: string;
  feedback?: string;
  offerShown?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CancelRequestBody;
    const subscriptionId = body.subscriptionId?.toString();
    const reason = body.reason?.toString() ?? "unspecified";
    const feedback = body.feedback?.toString() ?? null;
    const offerShown = Boolean(body.offerShown);

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
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
            // No-op
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
      .select("id,user_id,ls_subscription_id")
      .eq("ls_subscription_id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownRow) {
      return NextResponse.json(
        { error: "Subscription not found for this user" },
        { status: 404 },
      );
    }

    // Cancel via Lemon Squeezy API — cancels at the end of the current period.
    const lsResponse = await lsApi(`/subscriptions/${subscriptionId}`, {
      method: "DELETE",
    });

    if (!lsResponse.ok) {
      const text = await lsResponse.text();
      console.error("Lemon Squeezy cancel failed", { status: lsResponse.status, text });
      return NextResponse.json(
        { error: "Failed to cancel subscription with payment provider" },
        { status: 502 },
      );
    }

    // Log the reason using the service-role client (so RLS insert-constraint is
    // not a concern; users can still only SELECT their own rows).
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
        offer_shown: offerShown,
        offer_accepted: false,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Cancel API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
