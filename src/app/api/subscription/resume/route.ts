import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { resumeSubscription } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";

type ResumeRequestBody = {
  subscriptionId?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ResumeRequestBody;
    const subscriptionId = body.subscriptionId?.toString();

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
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

    if (ownRow.status !== "paused") {
      return NextResponse.json({ error: "This subscription is not paused" }, { status: 409 });
    }

    const resumed = await resumeSubscription(subscriptionId);
    if (!resumed) {
      return NextResponse.json(
        { error: "Failed to resume subscription with payment provider" },
        { status: 502 },
      );
    }

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
        .update({ status: "active", pause_resumes_at: null })
        .eq("ls_subscription_id", subscriptionId);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Resume API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
