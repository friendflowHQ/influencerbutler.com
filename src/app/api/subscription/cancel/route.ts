import { NextResponse } from "next/server";
import { lsApi } from "@/lib/lemonsqueezy";

type CancelRequestBody = {
  subscriptionId?: string;
};

export async function POST(request: Request) {
  try {
    const { subscriptionId } = (await request.json()) as CancelRequestBody;

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Cancel API error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
