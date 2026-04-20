import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/webhooks";
import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";

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
  auth: {
    admin: {
      createUser: (attrs: {
        email: string;
        email_confirm?: boolean;
        user_metadata?: Record<string, unknown>;
      }) => Promise<{
        data: { user: { id: string; email?: string | null } | null };
        error: { message?: string; status?: number } | null;
      }>;
      generateLink: (attrs: {
        type: "magiclink" | "recovery" | "invite";
        email: string;
        options?: { redirectTo?: string };
      }) => Promise<{
        data: { properties?: { action_link?: string } | null } | null;
        error: { message?: string } | null;
      }>;
      listUsers: (params?: { page?: number; perPage?: number }) => Promise<{
        data: { users: { id: string; email?: string | null }[] } | null;
        error: { message?: string } | null;
      }>;
    };
  };
};

function getString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

type ProfileLookup = { id?: string | null; email?: string | null };

async function findUserIdByEmail(
  supabase: SupabaseServiceClient,
  email: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();
  const row = data as unknown as ProfileLookup | null;
  return getString(row?.id);
}

async function sendWelcomeMagicLink(params: {
  to: string;
  actionLink: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("sendWelcomeMagicLink: RESEND_API_KEY not set — magic link email skipped");
    return false;
  }

  const body = [
    `Welcome to Influencer Butler — your payment is confirmed.`,
    ``,
    `Click the link below to finish setting up your account and download the desktop app:`,
    ``,
    `    ${params.actionLink}`,
    ``,
    `This link signs you in automatically. Once you're in, you can set a password from account settings if you'd like.`,
    ``,
    `Questions? Reply to this email and a real human will answer.`,
    ``,
    `— The Influencer Butler team`,
  ].join("\n");

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Influencer Butler <hello@influencerbutler.com>",
        to: [params.to],
        subject: "Your Influencer Butler sign-in link",
        text: body,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("sendWelcomeMagicLink: Resend send failed", {
        status: res.status,
        body: text.slice(0, 500),
      });
      return false;
    }
    return true;
  } catch (error) {
    console.error("sendWelcomeMagicLink: fetch threw", error);
    return false;
  }
}

/**
 * Sends the welcome magic-link email unless we've already sent one to this
 * profile in the last 10 minutes (avoids dup sends when LS retries a webhook
 * or order_created + subscription_created both resolve the same guest user).
 */
async function sendWelcomeMagicLinkIfFresh(
  supabase: SupabaseServiceClient,
  userId: string,
  email: string,
): Promise<void> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("welcome_email_sent_at")
    .eq("id", userId)
    .maybeSingle();

  const lastSent = getString((profile as { welcome_email_sent_at?: string | null } | null)?.welcome_email_sent_at);
  if (lastSent) {
    const sentAtMs = new Date(lastSent).getTime();
    if (Number.isFinite(sentAtMs) && Date.now() - sentAtMs < 10 * 60 * 1000) {
      return;
    }
  }

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl.replace(/\/$/, "")}/welcome` },
  });

  const actionLink = linkData?.properties?.action_link ?? null;
  if (linkError || !actionLink) {
    console.error("sendWelcomeMagicLinkIfFresh: generateLink failed", linkError);
    return;
  }

  const sent = await sendWelcomeMagicLink({ to: email, actionLink });
  if (sent) {
    await supabase
      .from("profiles")
      .update({ welcome_email_sent_at: new Date().toISOString() })
      .eq("id", userId);
  }
}

/**
 * Returns the Supabase user id for the given email, creating the auth user and
 * a matching profiles row if neither exists yet. Always sends a welcome
 * magic-link email (payment-first flow — the LS checkout is the user's only
 * interaction, so every guest order needs a sign-in link regardless of whether
 * a profile row pre-existed from an affiliate application, earlier signup
 * attempt, etc.). Dup sends are guarded by profiles.welcome_email_sent_at.
 */
async function ensureUserForEmail(
  supabase: SupabaseServiceClient,
  email: string,
  options: { lsCustomerId?: string | null } = {},
): Promise<string | null> {
  const normalized = email.trim();
  if (!normalized) return null;

  let userId = await findUserIdByEmail(supabase, normalized);

  if (userId) {
    // Opportunistically backfill ls_customer_id on the existing profile.
    if (options.lsCustomerId) {
      await supabase
        .from("profiles")
        .update({ ls_customer_id: options.lsCustomerId })
        .eq("id", userId);
    }
  } else {
    const { data: createData, error: createError } = await supabase.auth.admin.createUser({
      email: normalized,
      email_confirm: true,
      user_metadata: { created_via: "ls_checkout" },
    });

    if (createError || !createData.user?.id) {
      // Could be a race (concurrent webhook), OR an auth.users row exists from
      // a previous attempt but no profiles row was written. Look up the auth
      // user by email and backfill the profile row so downstream handlers
      // (subscription_created, license_key_created, etc.) can find them.
      userId = await findUserIdByEmail(supabase, normalized);
      if (!userId) {
        userId = await findAuthUserIdByEmail(supabase, normalized);
      }
      if (!userId) {
        const errMsg = createError?.message ?? "unknown";
        throw new Error(
          `ensureUserForEmail: createUser failed (${errMsg}) and no existing profile/auth user found for ${normalized}`,
        );
      }
      // Create the missing profile row for the orphan auth user.
      const profilePayload: Record<string, unknown> = { id: userId, email: normalized };
      if (options.lsCustomerId) profilePayload.ls_customer_id = options.lsCustomerId;
      await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
    } else {
      userId = createData.user.id;

      const profilePayload: Record<string, unknown> = {
        id: userId,
        email: normalized,
      };
      if (options.lsCustomerId) {
        profilePayload.ls_customer_id = options.lsCustomerId;
      }
      await supabase.from("profiles").upsert(profilePayload, { onConflict: "id" });
    }
  }

  await sendWelcomeMagicLinkIfFresh(supabase, userId, normalized);

  return userId;
}

/**
 * Fallback lookup: find a Supabase auth user by email when no profile row
 * exists. Uses paginated listUsers — fine for accounts under a few thousand
 * users. Returns the first matching user id or null.
 */
async function findAuthUserIdByEmail(
  supabase: SupabaseServiceClient,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  const list = supabase.auth.admin.listUsers;
  if (typeof list !== "function") return null;
  try {
    const { data, error } = await list({ page: 1, perPage: 200 });
    if (error || !data?.users) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    return match?.id ?? null;
  } catch (err) {
    console.error("findAuthUserIdByEmail: listUsers threw", err);
    return null;
  }
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

function readPercent(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed >= 100) return fallback;
  return parsed;
}

/**
 * Mints two per-user LS discount codes when a trial subscription starts:
 *   - monthly first-month discount, restricted to monthly variant
 *   - annual-switch discount, restricted to annual variant
 * Both expire 1 day after trial_ends_at. Failures are logged and return null
 * so the cron retries on the next tick (it detects null code columns).
 */
async function mintTrialDiscounts(input: {
  trialEndsAt: string | null;
  userId: string;
}): Promise<{
  trial_discount_code_monthly: string | null;
  trial_discount_code_annual: string | null;
  ls_discount_id_monthly: string | null;
  ls_discount_id_annual: string | null;
} | null> {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const monthlyVariant = process.env.LEMONSQUEEZY_VARIANT_MONTHLY;
  const annualVariant = process.env.LEMONSQUEEZY_VARIANT_ANNUAL;
  if (!storeId) {
    console.error("mintTrialDiscounts: LEMONSQUEEZY_STORE_ID not set");
    return null;
  }

  const monthlyPercent = readPercent("TRIAL_DISCOUNT_MONTHLY_PERCENT", 20);
  const annualPercent = readPercent("TRIAL_DISCOUNT_ANNUAL_PERCENT", 30);

  let expiresAt: string | null = null;
  if (input.trialEndsAt) {
    const end = new Date(input.trialEndsAt);
    if (Number.isFinite(end.getTime())) {
      expiresAt = new Date(end.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
  }

  const monthly = monthlyVariant
    ? await createUniqueDiscount({
        storeId,
        percentOff: monthlyPercent,
        namePrefix: "TRIAL",
        expiresAt,
        variantIds: [monthlyVariant],
        name: `Trial welcome ${monthlyPercent}% (monthly, user ${input.userId.slice(0, 8)})`,
      })
    : null;

  const annual = annualVariant
    ? await createUniqueDiscount({
        storeId,
        percentOff: annualPercent,
        namePrefix: "ANNUAL",
        expiresAt,
        variantIds: [annualVariant],
        name: `Trial annual-switch ${annualPercent}% (user ${input.userId.slice(0, 8)})`,
      })
    : null;

  if (!monthly && !annual) {
    return null;
  }

  return {
    trial_discount_code_monthly: monthly?.code ?? null,
    trial_discount_code_annual: annual?.code ?? null,
    ls_discount_id_monthly: monthly?.discountId ?? null,
    ls_discount_id_annual: annual?.discountId ?? null,
  };
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
      if (!recordId) {
        throw new Error("order_created: missing data.id (recordId)");
      }

      const lsCustomerId = getString(attrs.customer_id);
      const orderEmail = getString(attrs.user_email);

      // Payment-first flow: when the CTA used the guest checkout, there is no
      // supabase_user_id in custom_data. Provision the user from the order's
      // email and send a magic-link welcome email on first provisioning.
      const userId =
        directUserId ??
        (orderEmail ? await ensureUserForEmail(supabase, orderEmail, { lsCustomerId }) : null);
      if (!userId) {
        throw new Error(
          `order_created: no user context — directUserId=${directUserId ?? "null"}, orderEmail=${orderEmail ?? "null"}, lsCustomerId=${lsCustomerId ?? "null"}`,
        );
      }

      await recordExists(supabase, "orders", "ls_order_id", recordId);

      await supabase.from("orders").upsert(
        {
          ls_order_id: recordId,
          user_id: userId,
          status: getString(attrs.status),
          total: attrs.total ?? null,
          currency: getString(attrs.currency),
        },
        { onConflict: "ls_order_id" },
      );

      if (lsCustomerId) {
        await supabase
          .from("profiles")
          .update({ ls_customer_id: lsCustomerId })
          .eq("id", userId)
          .is("ls_customer_id", null);
      }
    },

    subscription_created: async () => {
      if (!recordId) {
        throw new Error("subscription_created: missing data.id (recordId)");
      }

      // subscription_created can arrive before order_created in rare ordering
      // scenarios. Fall back to email-based provisioning if custom_data didn't
      // carry supabase_user_id (guest checkout path).
      const subEmail = getString(attrs.user_email);
      const userId =
        directUserId ?? (subEmail ? await ensureUserForEmail(supabase, subEmail) : null);
      if (!userId) {
        throw new Error(
          `subscription_created: no user context — directUserId=${directUserId ?? "null"}, subEmail=${subEmail ?? "null"}`,
        );
      }

      await recordExists(supabase, "subscriptions", "ls_subscription_id", recordId);

      const status = getString(attrs.status);
      const isTrial = status === "on_trial";
      const trialEndsAt = getString(attrs.trial_ends_at);

      const basePayload: Record<string, unknown> = {
        ls_subscription_id: recordId,
        user_id: userId,
        status,
        plan_name: getString(attrs.product_name) ?? getString(attrs.variant_name),
        ls_product_id: attrs.product_id ?? null,
        ls_variant_id: attrs.variant_id ?? null,
        renews_at: attrs.renews_at ?? null,
      };

      if (isTrial) {
        basePayload.trial_started_at = new Date().toISOString();

        const trialDiscounts = await mintTrialDiscounts({
          trialEndsAt,
          userId,
        });
        if (trialDiscounts) {
          Object.assign(basePayload, trialDiscounts);
        }
      }

      await supabase.from("subscriptions").upsert(basePayload, {
        onConflict: "ls_subscription_id",
      });
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
    return NextResponse.json({ received: true, note: `no handler for ${eventName ?? "missing event_name"}` });
  }

  // Echo handler errors back into the 200 response body so they surface in the
  // LS "Recent deliveries" UI — we can't tail Vercel logs from every context,
  // and silently returning {received:true} meant 6 consecutive webhooks could
  // fail while LS showed green checkmarks. Still returns 200 so LS doesn't
  // retry-loop; if the fix needs a re-run, use LS's "Resend" button manually.
  try {
    await handler();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 4).join(" | ") : undefined;
    console.error(`Lemon Squeezy webhook event handling failed for ${eventName}`, error);
    return NextResponse.json({
      received: true,
      handler_error: { event: eventName, message, stack },
    });
  }

  return NextResponse.json({ received: true, event: eventName });
}
