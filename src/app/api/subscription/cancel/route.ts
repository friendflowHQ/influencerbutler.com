import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { lsApi } from "@/lib/lemonsqueezy";
import { normalizeWouldReturn } from "@/lib/cancel-reasons";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

type CancelRequestBody = {
  subscriptionId?: string;
  reason?: string;
  feedback?: string;
  intendedOutcome?: string;
  wouldReturn?: string;
  offerFeedback?: string;
  offerShown?: boolean;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as CancelRequestBody;
    const subscriptionId = body.subscriptionId?.toString();
    const reason = body.reason?.toString() ?? "unspecified";
    const feedback = body.feedback?.toString() ?? null;
    const intendedOutcome = body.intendedOutcome?.toString().trim() || null;
    const wouldReturn = normalizeWouldReturn(body.wouldReturn);
    const offerFeedback = body.offerFeedback?.toString().trim() || null;
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

    // The subscriptions table has RLS with no SELECT policy, so the user client
    // always read back nothing and every in-app cancel failed with "not found".
    // Read with the service role, still keyed by the signed-in user's id so this
    // stays a real ownership check.
    const admin = createAdminClient();
    const { data: ownRow } = await admin
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

    // Cancel via Lemon Squeezy API - cancels at the end of the current period.
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

    // Log the reason with the service-role client (RLS only lets users SELECT
    // their own rows). offer_feedback arrives with the hand-applied 20261017
    // migration; if prod lags, the insert errors on that column, so retry
    // without it (folding the text into feedback) rather than lose the answer.
    const baseRow = {
      user_id: user.id,
      subscription_id: subscriptionId,
      reason,
      feedback,
      intended_outcome: intendedOutcome,
      would_return: wouldReturn,
      source: "in_app",
      completed_at: new Date().toISOString(),
      offer_shown: offerShown,
      offer_accepted: false,
    };
    const first = await admin
      .from("subscription_cancel_reasons")
      .insert({ ...baseRow, offer_feedback: offerFeedback });
    if (first.error) {
      console.error("cancel: reason insert failed, retrying without offer_feedback", first.error);
      const merged = offerFeedback
        ? [feedback, `What's missing / broken: ${offerFeedback}`].filter(Boolean).join("\n\n")
        : feedback;
      const retry = await admin
        .from("subscription_cancel_reasons")
        .insert({ ...baseRow, feedback: merged });
      if (retry.error) console.error("cancel: reason insert retry failed", retry.error);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Cancel API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
