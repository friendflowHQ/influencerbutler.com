import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  lsApi,
  resolveAnnualVariantForMonthly,
  resolveVariantId,
  isAddonVariant,
  planForVariantId,
} from "@/lib/lemonsqueezy";
import { planMetaFor, ADDON_PLAN_DAILY_DEALS } from "@/lib/pricing-constants";

export const runtime = "nodejs";

/**
 * Switches an existing subscription to a different plan (tier and/or cadence)
 * by swapping its Lemon Squeezy variant in place.
 *
 * Without `targetPlan` in the body this is the legacy monthly-to-annual
 * upgrade within the same tier. With `targetPlan` (a plan string like
 * "duo-annual") it switches between any of the paid Pro plans, both
 * directions.
 *
 * Lemon Squeezy prorates a variant change by default: an upgrading payer is
 * invoiced the difference now (minus a credit for the unused days), a
 * downgrading payer keeps the proration credit on their account for future
 * invoices, and a trial user is never charged until the trial ends. The swap
 * keeps the same subscription and license key, instead of a fresh checkout
 * (which would create a second, parallel subscription).
 */

type UpgradeRequestBody = {
  subscriptionId?: string;
  targetPlan?: string;
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
    const targetPlan = body.targetPlan?.toString();

    if (!subscriptionId) {
      return NextResponse.json({ error: "Missing subscriptionId" }, { status: 400 });
    }

    // Comp subscriptions use a "comp:<uuid>" sentinel id and have no Lemon
    // Squeezy subscription behind them, so there is nothing to swap.
    if (subscriptionId.startsWith("comp:")) {
      return NextResponse.json(
        { error: "This plan was granted directly: contact support to change it." },
        { status: 400 },
      );
    }

    if (targetPlan != null) {
      if (targetPlan === ADDON_PLAN_DAILY_DEALS || planMetaFor(targetPlan) == null) {
        return NextResponse.json({ error: "Unknown target plan" }, { status: 400 });
      }
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

    if (status === "past_due") {
      return NextResponse.json(
        { error: "Fix your payment method before switching plans." },
        { status: 400 },
      );
    }

    if (status !== "active" && status !== "on_trial") {
      return NextResponse.json(
        { error: `Subscription cannot be upgraded from status "${status ?? "unknown"}"` },
        { status: 400 },
      );
    }

    let newVariantId: string;
    let invoiceImmediately: boolean;

    if (targetPlan != null) {
      // Generalized tier/cadence switch among the paid Pro plans.
      if (isAddonVariant(currentVariantId != null ? String(currentVariantId) : null)) {
        return NextResponse.json(
          { error: "The Daily Deals Workspace add-on cannot be switched to a Pro plan" },
          { status: 400 },
        );
      }

      const currentPlan = planForVariantId(currentVariantId);
      if (!currentPlan || currentPlan === ADDON_PLAN_DAILY_DEALS) {
        // Unrecognized variant (stale env vars, legacy SKU): the price
        // comparison below would be meaningless, so bail to support.
        return NextResponse.json(
          { error: "This subscription's plan cannot be switched automatically: contact support." },
          { status: 400 },
        );
      }

      const resolution = resolveVariantId(targetPlan, undefined);
      if (!resolution.ok) {
        console.error("upgrade: target variant unresolved", { targetPlan, resolution });
        return NextResponse.json(
          { error: "This plan is temporarily unavailable" },
          { status: 500 },
        );
      }

      if (currentVariantId != null && String(currentVariantId) === resolution.variantId) {
        return NextResponse.json({ error: "You are already on this plan" }, { status: 400 });
      }

      newVariantId = resolution.variantId;

      // Invoice now only when an active payer moves to a pricier plan: the
      // prorated difference lands immediately. Downgrades swap right away and
      // leave the proration credit on the account for future invoices, and a
      // trial is never invoiced until it ends.
      const currentMeta = planMetaFor(currentPlan);
      const targetMeta = planMetaFor(targetPlan);
      invoiceImmediately =
        status === "active" &&
        currentMeta != null &&
        targetMeta != null &&
        targetMeta.priceCents > currentMeta.priceCents;
    } else {
      // Legacy body (no targetPlan): monthly-to-annual within the same tier.
      const annualVariantId = resolveAnnualVariantForMonthly(currentVariantId);
      if (!annualVariantId) {
        // Already annual, an unrecognised variant, or the add-on.
        return NextResponse.json(
          { error: "This plan is already annual or cannot be switched to annual" },
          { status: 400 },
        );
      }
      newVariantId = annualVariantId;
      invoiceImmediately = status === "active";
    }

    // Swap the variant. LS prorates by default; see invoiceImmediately above
    // for when the prorated charge lands.
    const patchResponse = await lsApi(`/subscriptions/${subscriptionId}`, {
      method: "PATCH",
      body: JSON.stringify({
        data: {
          type: "subscriptions",
          id: subscriptionId,
          attributes: {
            variant_id: Number(newVariantId),
            invoice_immediately: invoiceImmediately,
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
      return NextResponse.json({ error: "Could not switch plans" }, { status: 502 });
    }

    // The subscription_updated webhook persists the new variant/plan/renewal to
    // the subscriptions table; the client just reloads to pick it up.
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("upgrade error", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
