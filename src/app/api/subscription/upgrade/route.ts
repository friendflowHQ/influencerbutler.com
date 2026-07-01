import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { lsApi, resolveAnnualVariantForMonthly } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";

/**
 * Swaps an existing monthly subscription to the same tier's annual variant.
 *
 * Lemon Squeezy prorates a variant change by default: an active payer is
 * charged the annual price now minus a credit for the unused days of the
 * current month, and the renewal date moves out a year. A trial user is not
 * charged now: they simply get billed annual when the trial ends. This is the
 * clean upgrade path that keeps the same subscription and license key, instead
 * of a fresh checkout (which would create a second, parallel subscription).
 */

type UpgradeRequestBody = {
  subscriptionId?: string;
};

type LsSubscriptionResponse = {
  data?: {
    attributes?: {
      status?: string | null;
      variant_id?: string | number | null;
    };
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UpgradeRequestBody;
    const subscriptionId = body.subscriptionId?.toString();

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
            // No-op: route handler doesn't refresh cookies.
          },
        },
      },
    );

    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;

    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Ownership check via the service-role client: the subscriptions table has
    // no SELECT policy, so the RLS user client returns nothing. Keying on both
    // ls_subscription_id and the authenticated user_id keeps this a genuine
    // ownership check (a user can only upgrade their own subscription).
    const { data: ownRow } = await createAdminClient()
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

    // Read the live subscription from Lemon Squeezy for the authoritative
    // status + current variant (the local row can lag the LS state).
    const subResponse = await lsApi(`/subscriptions/${subscriptionId}`, { method: "GET" });
    if (!subResponse.ok) {
      const text = await subResponse.text().catch(() => "");
      console.error("upgrade: subscription lookup failed", {
        status: subResponse.status,
        text: text.slice(0, 500),
      });
      return NextResponse.json({ error: "Could not load subscription" }, { status: 502 });
    }

    const subPayload = (await subResponse.json()) as LsSubscriptionResponse;
    const status = subPayload.data?.attributes?.status ?? null;
    const currentVariantId = subPayload.data?.attributes?.variant_id ?? null;

    if (status !== "active" && status !== "on_trial") {
      return NextResponse.json(
        { error: `Subscription cannot be upgraded from status "${status ?? "unknown"}"` },
        { status: 400 },
      );
    }

    const annualVariantId = resolveAnnualVariantForMonthly(currentVariantId);
    if (!annualVariantId) {
      // Already annual, an unrecognised variant, or the add-on.
      return NextResponse.json(
        { error: "This plan is already annual or cannot be switched to annual" },
        { status: 400 },
      );
    }

    // Swap the variant. LS prorates by default; invoice the active payer now so
    // the prorated charge lands immediately and the renewal date moves out a
    // year. For a trial, do not force an invoice - they get billed annual when
    // the trial ends.
    const patchResponse = await lsApi(`/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "subscriptions",
          id: subscriptionId,
          attributes: {
            variant_id: Number(annualVariantId),
            invoice_immediately: status === "active",
          },
        },
      }),
    });

    if (!patchResponse.ok) {
      const text = await patchResponse.text().catch(() => "");
      console.error("upgrade: variant swap failed", {
        status: patchResponse.status,
        text: text.slice(0, 500),
      });
      return NextResponse.json({ error: "Could not switch to annual" }, { status: 502 });
    }

    // The subscription_updated webhook persists the new variant/plan/renewal to
    // the subscriptions table; the client just reloads to pick it up.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("upgrade error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
