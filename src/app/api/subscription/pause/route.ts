import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { pauseSubscription } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";

const ALLOWED_MONTHS = new Set([1, 2, 3]);
const PAUSABLE_STATUSES = new Set(["active", "on_trial", "past_due"]);

type PauseRequestBody = {
  subscriptionId?: string;
  months?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PauseRequestBody;
    const subscriptionId = body.subscriptionId?.toString();
    const months = Number(body.months);

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }
    if (!ALLOWED_MONTHS.has(months)) {
      return NextResponse.json({ error: "months must be 1, 2, or 3" }, { status: 400 });
    }

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
      .select("id,user_id,ls_subscription_id,status")
      .eq("ls_subscription_id", subscriptionId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!ownRow) {
      return NextResponse.json(
        { error: "Subscription not found for this user" },
        { status: 404 },
      );
    }

    if (!PAUSABLE_STATUSES.has(ownRow.status ?? "")) {
      return NextResponse.json(
        { error: "This subscription can't be paused right now" },
        { status: 409 },
      );
    }

    const resumesAt = new Date();
    resumesAt.setUTCMonth(resumesAt.getUTCMonth() + months);
    const resumesAtIso = resumesAt.toISOString();

    const paused = await pauseSubscription(subscriptionId, resumesAtIso);
    if (!paused) {
      return NextResponse.json(
        { error: "Failed to pause subscription with payment provider" },
        { status: 502 },
      );
    }

    // Reflect the pause locally right away - the subscription_paused webhook
    // will also write this, idempotently, whenever it lands.
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

      await serviceClient
        .from("subscriptions")
        .update({ status: "paused", pause_resumes_at: resumesAtIso })
        .eq("ls_subscription_id", subscriptionId);
    }

    return NextResponse.json({ ok: true, resumesAt: resumesAtIso });
  } catch (error) {
    console.error("Pause API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
