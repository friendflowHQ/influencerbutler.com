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

type QueryResult = Promise<{ data: Record<string, unknown> | null }>;

type SupabaseServiceClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => QueryResult;
      };
      ilike: (column: string, pattern: string) => {
        maybeSingle: () => QueryResult;
      };
    };
    upsert: (payload: Record<string, unknown>, options?: { onConflict: string }) => Promise<unknown>;
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<unknown> & { is: (column: string, value: null) => Promise<unknown> };
    };
  };
};

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

async function findUserIdBySubscription(supabase: SupabaseServiceClient, lsSubscriptionId: string) {
  const { data } = await supabase
    .from("subscriptions")
    .select("user_id")
    .eq("ls_subscription_id", lsSubscriptionId)
    .maybeSingle();

  return getString(data?.user_id);
}

async function recordExists(supabase: SupabaseServiceClient, table: string, column: string, value: string) {
  const { data } = await supabase.from(table).select("id").eq(column, value).maybeSingle();
  return Boolean(data);
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
    return NextResponse.json({ error: "Webhook configuration error" }, { status: 500 });
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
  }) as unknown as SupabaseServiceClient;

  let payload: LsWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as LsWebhookPayload;
  } catch (error) {
    console.error("Invalid Lemon Squeezy webhook payload", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventName = payload.meta?.event_name;
  const attrs = payload.data?.attributes ?? {};
  const recordId = getString(payload.data?.id);
  const directUserId = getString(payload.meta?.custom_data?.supabase_user_id);

  const handlers: Record<string, () => Promise<void>> = {
    order_created: async () => {
      if (!recordId || !directUserId) {
        return;
      }

      await recordExists(supabase, "orders", "ls_order_id", recordId);

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
    },

    subscription_created: async () => {
      if (!recordId || !directUserId) {
        return;
      }

      await recordExists(supabase, "subscriptions", "ls_subscription_id", recordId);

      await supabase.from("subscriptions").upsert(
        {
          ls_subscription_id: recordId,
          user_id: directUserId,
          status: getString(attrs.status),
          plan_name: getString(attrs.product_name) ?? getString(attrs.variant_name),
          ls_product_id: attrs.product_id ?? null,
          ls_variant_id: attrs.variant_id ?? null,
          renews_at: attrs.renews_at ?? null,
        },
        { onConflict: "ls_subscription_id" },
      );
    },

    subscription_updated: async () => {
      if (!recordId) {
        return;
      }

      await supabase
        .from("subscriptions")
        .update({
          status: getString(attrs.status),
          renews_at: attrs.renews_at ?? null,
          ends_at: attrs.ends_at ?? null,
        })
        .eq("ls_subscription_id", recordId);
    },

    subscription_cancelled: async () => {
      if (!recordId) {
        return;
      }

      await supabase
        .from("subscriptions")
        .update({
          status: "cancelled",
          ends_at: attrs.ends_at ?? attrs.cancelled_at ?? null,
        })
        .eq("ls_subscription_id", recordId);
    },

    subscription_paused: async () => {
      if (!recordId) {
        return;
      }

      await supabase
        .from("subscriptions")
        .update({ status: "paused" })
        .eq("ls_subscription_id", recordId);
    },

    subscription_resumed: async () => {
      if (!recordId) {
        return;
      }

      await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("ls_subscription_id", recordId);
    },

    subscription_payment_success: async () => {
      const renewalOrderId = getString(attrs.order_id) ?? recordId;

      if (!renewalOrderId) {
        return;
      }

      const lsSubscriptionId = getString(attrs.subscription_id);
      const userId =
        directUserId ||
        (lsSubscriptionId ? await findUserIdBySubscription(supabase, lsSubscriptionId) : null);

      if (!userId) {
        return;
      }

      await recordExists(supabase, "orders", "ls_order_id", renewalOrderId);

      await supabase.from("orders").upsert(
        {
          ls_order_id: renewalOrderId,
          user_id: userId,
          status: getString(attrs.status) ?? "paid",
          total: attrs.total ?? null,
          currency: getString(attrs.currency),
        },
        { onConflict: "ls_order_id" },
      );
    },

    subscription_payment_failed: async () => {
      const lsSubscriptionId = getString(attrs.subscription_id) ?? recordId;

      if (!lsSubscriptionId) {
        return;
      }

      await supabase
        .from("subscriptions")
        .update({ status: "past_due" })
        .eq("ls_subscription_id", lsSubscriptionId);
    },

    affiliate_activated: async () => {
      // LS fires this when a merchant (or auto-approval) activates an affiliate
      // on their hosted portal. We match the affiliate back to our user by
      // email (they signed up on LS with the same email they used on our
      // application form) and persist the new LS affiliate ID.
      if (!recordId) return;

      const rawEmail =
        getString(attrs.user_email) ??
        getString((attrs as Record<string, unknown>).email);
      if (!rawEmail) {
        console.error("affiliate_activated: no email in webhook payload");
        return;
      }
      const email = rawEmail.toLowerCase();

      // Case-insensitive match: our applications table stores email as the
      // user typed it; LS tends to lowercase. Use ilike to be safe.
      const { data: appData } = await supabase
        .from("affiliate_applications")
        .select("user_id")
        .ilike("email", email)
        .maybeSingle();

      const userId = getString(appData?.user_id);
      if (!userId) {
        console.warn("affiliate_activated: no matching application for email", email);
        return;
      }

      await supabase.from("profiles").upsert(
        {
          id: userId,
          is_affiliate: true,
          ls_affiliate_id: recordId,
        },
        { onConflict: "id" },
      );
    },

    license_key_created: async () => {
      if (!recordId) {
        return;
      }

      const lsSubscriptionId = getString(attrs.subscription_id);
      const userId =
        directUserId ||
        (lsSubscriptionId ? await findUserIdBySubscription(supabase, lsSubscriptionId) : null);

      if (!userId) {
        return;
      }

      await recordExists(supabase, "license_keys", "ls_license_key_id", recordId);

      await supabase.from("license_keys").upsert(
        {
          ls_license_key_id: recordId,
          user_id: userId,
          key: getString(attrs.key),
          status: getString(attrs.status),
          activation_limit: attrs.activation_limit ?? null,
          ls_subscription_id: lsSubscriptionId,
        },
        { onConflict: "ls_license_key_id" },
      );
    },

    license_key_updated: async () => {
      if (!recordId) {
        return;
      }

      await supabase
        .from("license_keys")
        .update({ status: getString(attrs.status) })
        .eq("ls_license_key_id", recordId);
    },
  };

  const handler = eventName ? handlers[eventName] : undefined;

  if (!handler) {
    return NextResponse.json({ received: true });
  }

  try {
    await handler();
  } catch (error) {
    console.error(`Lemon Squeezy webhook event handling failed for ${eventName}`, error);
  }

  return NextResponse.json({ received: true });
}
