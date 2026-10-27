import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { lsApi, planForVariantId } from "@/lib/lemonsqueezy";
import { parseLevelPlan, tierForPlan, levelTiers } from "@/lib/pricing-constants";
import { hasRedeemedDiscount } from "@/lib/discount-eligibility";

export const runtime = "nodejs";

/**
 * Schedules (POST) or cancels (DELETE) a downgrade to a Beginner-level plan,
 * effective at the subscription's next renewal - not an immediate variant
 * swap. Unlike /api/subscription/upgrade (which prorates immediately), this
 * never touches Lemon Squeezy on the way in: it only records intent locally.
 * The /api/cron/apply-scheduled-downgrades cron performs the actual variant
 * swap once scheduled_plan_effective_at passes, so the customer is never
 * charged or credited mid-cycle for a change they scheduled ahead of time.
 *
 * Refuses accounts with any hasRedeemedDiscount() signal: it is not known
 * whether a Lemon Squeezy variant swap preserves an active referral/loyalty
 * discount, so those accounts are routed to support instead of self-serve
 * until that is verified directly against Lemon Squeezy.
 */

type ScheduleRequestBody = {
  subscriptionId?: string;
  targetPlan?: string;
};

type LsSubscriptionResponse = {
  data?: {
    attributes?: {
      status?: string | null;
      variant_id?: string | number | null;
      renews_at?: string | null;
    };
  };
};

async function authenticate(): Promise<{ id: string } | null> {
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
  const { data } = await userClient.auth.getUser();
  return data.user ? { id: data.user.id } : null;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScheduleRequestBody;
    const subscriptionId = body.subscriptionId?.toString();
    const targetPlan = body.targetPlan?.toString();

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }
    if (subscriptionId.startsWith("comp:")) {
      return NextResponse.json(
        { error: "This plan was granted directly: contact support to change it." },
        { status: 400 },
      );
    }

    const parsedTarget = parseLevelPlan(targetPlan);
    if (!parsedTarget || parsedTarget.level !== "beginner") {
      return NextResponse.json({ error: "Unknown target plan" }, { status: 400 });
    }
    if (!levelTiers("beginner").includes(parsedTarget.tier)) {
      return NextResponse.json({ error: "This plan is not sold on Beginner" }, { status: 400 });
    }

    const user = await authenticate();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();

    // Ownership check via the service-role client: subscriptions has no SELECT
    // RLS policy, so a plain user-session client can't read this row.
    const { data: ownRow } = await admin
      .from("subscriptions")
      .select("id,user_id,ls_subscription_id")
      .eq("ls_subscription_id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownRow) {
      return NextResponse.json({ error: "Subscription not found for this user" }, { status: 404 });
    }

    // Never trust a client-supplied eligibility flag for this - recheck here.
    if (await hasRedeemedDiscount(admin, user.id)) {
      return NextResponse.json(
        { error: "This account has a discount on file: contact support to change plans." },
        { status: 400 },
      );
    }

    const subResponse = await lsApi(`/subscriptions/${subscriptionId}`, { method: "GET" });
    if (!subResponse.ok) {
      const text = await subResponse.text().catch(() => "");
      console.error("schedule-downgrade: subscription lookup failed", {
        status: subResponse.status,
        text: text.slice(0, 500),
      });
      return NextResponse.json({ error: "Could not load subscription" }, { status: 502 });
    }

    const subPayload = (await subResponse.json()) as LsSubscriptionResponse;
    const status = subPayload.data?.attributes?.status ?? null;
    const currentVariantId = subPayload.data?.attributes?.variant_id ?? null;
    const renewsAt = subPayload.data?.attributes?.renews_at ?? null;

    if (status !== "active" && status !== "on_trial") {
      return NextResponse.json(
        { error: `Subscription cannot be downgraded from status "${status ?? "unknown"}"` },
        { status: 400 },
      );
    }
    if (!renewsAt) {
      return NextResponse.json({ error: "Could not determine the next renewal date" }, { status: 502 });
    }

    const currentPlan = planForVariantId(currentVariantId);
    const currentTier = tierForPlan(currentPlan);
    if (!currentTier || currentTier !== parsedTarget.tier) {
      return NextResponse.json(
        { error: "The Beginner plan must match your current seat tier" },
        { status: 400 },
      );
    }

    const { error: updateError } = await admin
      .from("subscriptions")
      .update({
        scheduled_plan: targetPlan,
        scheduled_plan_effective_at: renewsAt,
        scheduled_plan_applied_at: null,
      })
      .eq("ls_subscription_id", subscriptionId);

    if (updateError) {
      console.error("schedule-downgrade: write failed", updateError);
      return NextResponse.json({ error: "Could not schedule the downgrade" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, scheduledPlan: targetPlan, effectiveAt: renewsAt });
  } catch (error) {
    console.error("schedule-downgrade error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as ScheduleRequestBody;
    const subscriptionId = body.subscriptionId?.toString();
    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }

    const user = await authenticate();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();

    const { data: ownRow } = await admin
      .from("subscriptions")
      .select("id,user_id,ls_subscription_id")
      .eq("ls_subscription_id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownRow) {
      return NextResponse.json({ error: "Subscription not found for this user" }, { status: 404 });
    }

    const { error: updateError } = await admin
      .from("subscriptions")
      .update({ scheduled_plan: null, scheduled_plan_effective_at: null, scheduled_plan_applied_at: null })
      .eq("ls_subscription_id", subscriptionId);

    if (updateError) {
      console.error("schedule-downgrade: cancel failed", updateError);
      return NextResponse.json({ error: "Could not cancel the scheduled downgrade" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("schedule-downgrade cancel error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
