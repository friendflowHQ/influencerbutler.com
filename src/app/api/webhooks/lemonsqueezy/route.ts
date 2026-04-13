import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/webhooks";

export const runtime = "nodejs";

type LsWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: {
      supabase_user_id?: string;
    };
  };
  data?: {
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

type SupabaseServiceClient = ReturnType<typeof createServerClient>;

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function findUserIdBySubscription(supabase: any, lsSubscriptionId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("ls_subscription_id", lsSubscriptionId)
    .maybeSingle();

  return getString(data?.user_id);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("X-Signature") ?? "";

  if (!verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error("Missing Supabase service-role configuration for webhook processing");
    return NextResponse.json({ received: true });
  }

  const supabase = createServerClient(supabaseUrl, supabaseServiceRoleKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // no-op for stateless webhook endpoint
      },
    },
  }) as any;

  try {
    const payload = JSON.parse(rawBody) as LsWebhookPayload;

    const eventName = payload.meta?.event_name;
    const attrs = payload.data?.attributes ?? {};
    const recordId = getString(payload.data?.id);
    const directUserId = getString(payload.meta?.custom_data?.supabase_user_id);

    switch (eventName) {
      case "order_created": {
        if (!recordId || !directUserId) {
          break;
        }

        await supabase.from("orders").upsert(
          {
            ls_order_id: recordId,
            user_id: directUserId,
            status: getString(attrs.status),
            total: attrs.total ?? null,
            currency: getString(attrs.currency),
          },
          { onConflict: "ls_order_id" },
        );

        const lsCustomerId = getString(attrs.customer_id);

        if (lsCustomerId) {
          await supabase
            .from("profiles")
            .update({ ls_customer_id: lsCustomerId })
            .eq("id", directUserId)
            .is("ls_customer_id", null);
        }

        break;
      }

      case "subscription_created": {
        if (!recordId || !directUserId) {
          break;
        }

        const { data: existing } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("ls_subscription_id", recordId)
          .maybeSingle();

        if (existing) {
          break;
        }

        await supabase.from("subscriptions").insert({
          ls_subscription_id: recordId,
          user_id: directUserId,
          status: getString(attrs.status),
          plan_name: getString(attrs.product_name) ?? getString(attrs.variant_name),
          ls_product_id: attrs.product_id ?? null,
          ls_variant_id: attrs.variant_id ?? null,
          renews_at: attrs.renews_at ?? null,
        });

        break;
      }

      case "subscription_updated": {
        if (!recordId) {
          break;
        }

        await supabase
          .from("subscriptions")
          .update({
            status: getString(attrs.status),
            renews_at: attrs.renews_at ?? null,
            ends_at: attrs.ends_at ?? null,
          })
          .eq("ls_subscription_id", recordId);

        break;
      }

      case "subscription_cancelled": {
        if (!recordId) {
          break;
        }

        await supabase
          .from("subscriptions")
          .update({
            status: "cancelled",
            ends_at: attrs.ends_at ?? attrs.cancelled_at ?? null,
          })
          .eq("ls_subscription_id", recordId);

        break;
      }

      case "subscription_paused":
      case "subscription_resumed": {
        if (!recordId) {
          break;
        }

        await supabase
          .from("subscriptions")
          .update({ status: eventName === "subscription_paused" ? "paused" : "active" })
          .eq("ls_subscription_id", recordId);

        break;
      }

      case "subscription_payment_success": {
        const renewalOrderId = getString(attrs.order_id) ?? recordId;

        if (!renewalOrderId) {
          break;
        }

        const lsSubscriptionId = getString(attrs.subscription_id);
        const userId =
          directUserId ||
          (lsSubscriptionId ? await findUserIdBySubscription(supabase, lsSubscriptionId) : null);

        if (!userId) {
          break;
        }

        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("ls_order_id", renewalOrderId)
          .maybeSingle();

        if (existing) {
          break;
        }

        await supabase.from("orders").insert({
          ls_order_id: renewalOrderId,
          user_id: userId,
          status: getString(attrs.status) ?? "paid",
          total: attrs.total ?? null,
          currency: getString(attrs.currency),
        });

        break;
      }

      case "subscription_payment_failed": {
        const lsSubscriptionId = getString(attrs.subscription_id) ?? recordId;

        if (!lsSubscriptionId) {
          break;
        }

        await supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("ls_subscription_id", lsSubscriptionId);

        break;
      }

      case "license_key_created": {
        if (!recordId) {
          break;
        }

        const lsSubscriptionId = getString(attrs.subscription_id);
        const userId =
          directUserId ||
          (lsSubscriptionId ? await findUserIdBySubscription(supabase, lsSubscriptionId) : null);

        if (!userId) {
          break;
        }

        const { data: existing } = await supabase
          .from("license_keys")
          .select("id")
          .eq("ls_license_key_id", recordId)
          .maybeSingle();

        if (existing) {
          break;
        }

        await supabase.from("license_keys").insert({
          ls_license_key_id: recordId,
          user_id: userId,
          key: getString(attrs.key),
          status: getString(attrs.status),
          activation_limit: attrs.activation_limit ?? null,
          ls_subscription_id: lsSubscriptionId,
        });

        break;
      }

      case "license_key_updated": {
        if (!recordId) {
          break;
        }

        await supabase
          .from("license_keys")
          .update({ status: getString(attrs.status) })
          .eq("ls_license_key_id", recordId);

        break;
      }

      default:
        break;
    }
  } catch (error) {
    console.error("Lemon Squeezy webhook processing error", error);
  }

  return NextResponse.json({ received: true });
}
