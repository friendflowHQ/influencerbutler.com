import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/webhooks";
import { mintTrialDiscounts } from "@/lib/trial-discounts";
import { hasRedeemedDiscount } from "@/lib/discount-eligibility";
import { firstNameFrom, logPurchaseActivity } from "@/lib/recent-activity";
import { logWebhookEvent } from "@/lib/webhook-events";
import { lsApi, planForVariantId, setLicenseKeyActivationLimit } from "@/lib/lemonsqueezy";
import { SEAT_LIMIT, tierForPlan } from "@/lib/pricing-constants";
import { rewardReferrerForSubscription } from "@/lib/referral-program";
import { sendCancelSurveyEmail } from "@/lib/cancel-survey-email";
import { sendEmail } from "@/lib/email-send";
import { sendMetaEvent } from "@/lib/meta-capi";

export const runtime = "nodejs";

function sha256Hex(value: string | null): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex");
}

type LsWebhookPayload = {
  meta?: {
    event_name?: string;
    custom_data?: {
      supabase_user_id?: string;
      welcome_token?: string;
      ref_affiliate_user_id?: string;
      ref_affiliate_code?: string;
      ref_attribution_status?: string;
      fbp?: string;
      fbc?: string;
      meta_consent?: string;
    };
  };
  data?: {
    id?: string;
    attributes?: Record<string, unknown>;
  };
};

type QueryResult = Promise<{ data: Record<string, unknown> | null }>;

type ListResult = Promise<{
  data: Record<string, unknown>[] | null;
  error: { message?: string } | null;
}>;

type WriteResult = { error: { message?: string; code?: string; details?: string } | null };

// A PostgREST select builder: chainable filters that either narrow to a single
// row via maybeSingle() or resolve directly (awaited) to the full row list.
type SelectFilter = ListResult & {
  eq: (column: string, value: string) => SelectFilter;
  neq: (column: string, value: string) => SelectFilter;
  ilike: (column: string, pattern: string) => SelectFilter;
  maybeSingle: () => QueryResult;
};

// An update() filter chain: chainable filters that resolve (awaited) to a
// WriteResult, or return the affected rows via select(). Superset of the
// legacy .eq().is()/.not() shape so existing call sites keep type-checking.
type UpdateFilter = Promise<WriteResult> & {
  eq: (column: string, value: string) => UpdateFilter;
  is: (column: string, value: null) => Promise<WriteResult>;
  not: (column: string, op: string, value: null) => UpdateFilter;
  or: (filters: string) => UpdateFilter;
  select: (columns: string) => ListResult;
};

type SupabaseServiceClient = {
  from: (table: string) => {
    select: (columns: string) => SelectFilter;
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<WriteResult>;
    insert: (payload: Record<string, unknown>) => Promise<WriteResult>;
    update: (payload: Record<string, unknown>) => {
      eq: (column: string, value: string) => UpdateFilter;
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

/**
 * Like getString but also accepts finite numbers. Lemon Squeezy sends its
 * relational ids (subscription_id, order_id, customer_id) inside `attributes`
 * as JSON numbers, not strings, so getString silently returned null for them.
 * That dropped the subscription lookup on renewal (subscription_payment_success)
 * webhooks - which carry no custom_data and no directUserId - and failed every
 * renewal with "no user context for sub=null".
 */
function getIdString(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

/**
 * Awaits a Supabase mutation and throws on error with the DB-reported reason.
 * Silent write failures were masking RLS/FK/column-missing issues that made
 * webhooks look like they succeeded while no rows landed.
 */
async function assertWrite(
  label: string,
  promise: Promise<WriteResult>,
): Promise<void> {
  const { error } = await promise;
  if (error) {
    const parts = [error.code, error.message, error.details].filter(Boolean).join(" | ");
    throw new Error(`${label} failed: ${parts || "unknown"}`);
  }
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
  const body = [
    `Welcome to Influencer Butler - your payment is confirmed.`,
    ``,
    `Click the link below to finish setting up your account and download the desktop app:`,
    ``,
    `    ${params.actionLink}`,
    ``,
    `This link signs you in automatically. Once you're in, you can set a password from account settings if you'd like.`,
    ``,
    `Questions? Reply to this email and a real human will answer.`,
    ``,
    `- The Influencer Butler team`,
  ].join("\n");

  const { ok } = await sendEmail({
    from: "Influencer Butler <hello@influencerbutler.com>",
    to: params.to,
    subject: "Your Influencer Butler sign-in link",
    text: body,
    category: "purchase_welcome",
  });
  return ok;
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
  // Atomically claim the send BEFORE dispatching. order_created and
  // subscription_created arrive as near-simultaneous webhook deliveries for a
  // new subscription; a read-then-write guard lets both read a null timestamp
  // and both send. Instead we stamp welcome_email_sent_at conditionally and
  // only proceed if THIS update actually matched a row - the losing event gets
  // zero rows back and bails. The condition also permits re-claiming a stamp
  // older than 10 minutes (a genuine LS retry long after the first send).
  const claimAtIso = new Date().toISOString();
  const staleBeforeIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("profiles")
    .update({ welcome_email_sent_at: claimAtIso })
    .eq("id", userId)
    .or(`welcome_email_sent_at.is.null,welcome_email_sent_at.lt.${staleBeforeIso}`)
    .select("id");

  if (claimError) {
    console.error("sendWelcomeMagicLinkIfFresh: claim update failed", claimError);
    return;
  }
  if (!claimed || claimed.length === 0) {
    // Another concurrent event already claimed the send (or one went out in the
    // last 10 minutes). Nothing to do.
    return;
  }

  const siteUrl =
    process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
  const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${siteUrl.replace(/\/$/, "")}/welcome` },
  });

  const actionLink = linkData?.properties?.action_link ?? null;
  const sent = actionLink ? await sendWelcomeMagicLink({ to: email, actionLink }) : false;

  if (!sent) {
    // Release the claim so a retry (or the other event) can send. Only clear
    // the stamp if it still holds the value we wrote, so we don't stomp a
    // successful send from a racing event that claimed after us.
    if (linkError || !actionLink) {
      console.error("sendWelcomeMagicLinkIfFresh: generateLink failed", linkError);
    }
    await supabase
      .from("profiles")
      .update({ welcome_email_sent_at: null })
      .eq("id", userId)
      .eq("welcome_email_sent_at", claimAtIso);
  }
}

/**
 * Returns the Supabase user id for the given email, creating the auth user and
 * a matching profiles row if neither exists yet. Always sends a welcome
 * magic-link email (payment-first flow - the LS checkout is the user's only
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
      await assertWrite(
        "profiles.update(ls_customer_id) on existing",
        supabase
          .from("profiles")
          .update({ ls_customer_id: options.lsCustomerId })
          .eq("id", userId),
      );
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
      await assertWrite(
        "profiles.upsert(orphan-auth-user)",
        supabase.from("profiles").upsert(profilePayload, { onConflict: "id" }),
      );
    } else {
      userId = createData.user.id;

      const profilePayload: Record<string, unknown> = {
        id: userId,
        email: normalized,
      };
      if (options.lsCustomerId) {
        profilePayload.ls_customer_id = options.lsCustomerId;
      }
      await assertWrite(
        "profiles.upsert(new-user)",
        supabase.from("profiles").upsert(profilePayload, { onConflict: "id" }),
      );

      // Read-back verification: RLS misconfig can make upserts return
      // {data:[], error:null} without actually inserting the row, which
      // then causes FK violations on downstream orders/subscriptions.
      const readBack = await findUserIdByEmail(supabase, normalized);
      if (!readBack) {
        throw new Error(
          `profiles.upsert(new-user) reported success but row is not queryable - suspect RLS filter on profiles for id=${userId}, email=${normalized}. Check SUPABASE_SERVICE_ROLE_KEY and RLS policies.`,
        );
      }
    }
  }

  await sendWelcomeMagicLinkIfFresh(supabase, userId, normalized);

  return userId;
}

/**
 * Fallback lookup: find a Supabase auth user by email when no profile row
 * exists. Uses paginated listUsers - fine for accounts under a few thousand
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

/**
 * Resolves a subscription's stored affiliate attribution so renewal orders can
 * be credited to the referring affiliate (renewal webhooks carry no
 * custom_data). Returns the owning user id plus the ref_* fields captured at
 * subscription_created time. All null when the subscription had no referral.
 */
async function findSubscriptionAttribution(
  supabase: SupabaseServiceClient,
  lsSubscriptionId: string,
): Promise<{
  userId: string | null;
  refAffiliateUserId: string | null;
  refAffiliateCode: string | null;
  attributionStatus: string | null;
}> {
  const { data } = await supabase
    .from("subscriptions")
    .select("user_id,ref_affiliate_user_id,ref_affiliate_code,attribution_status")
    .eq("ls_subscription_id", lsSubscriptionId)
    .maybeSingle();
  return {
    userId: getString(data?.user_id),
    refAffiliateUserId: getString(data?.ref_affiliate_user_id),
    refAffiliateCode: getString(data?.ref_affiliate_code),
    attributionStatus: getString(data?.attribution_status),
  };
}

/**
 * Resolves the LS subscription id (a numeric string from the webhook payload)
 * to our internal subscriptions row: both the primary-key `id` and `user_id`.
 * license_keys.subscription_id is a FK to subscriptions.id (NOT the LS id), and
 * /api/welcome/license joins on it, so license_key_created must store the
 * internal id here, not the LS string.
 */
async function findSubscriptionByLsId(
  supabase: SupabaseServiceClient,
  lsSubscriptionId: string,
): Promise<{ id: string | null; userId: string | null }> {
  const { data } = await supabase
    .from("subscriptions")
    .select("id,user_id")
    .eq("ls_subscription_id", lsSubscriptionId)
    .maybeSingle();
  return { id: getString(data?.id), userId: getString(data?.user_id) };
}

async function recordExists(supabase: SupabaseServiceClient, table: string, column: string, value: string) {
  const { data } = await supabase.from(table).select("id").eq(column, value).maybeSingle();
  return Boolean(data);
}

/**
 * Analytics stamp: the FIRST time a trial subscription reports status
 * 'active', record trial_converted_at. Idempotent (the is-null guard) and
 * trials-only (the not-null trial_started_at guard). Best-effort by design:
 * unlike the core writes this must NEVER fail the event, because the column
 * arrives with a manually-applied migration (20260704) that prod may lag.
 */
async function stampTrialConversion(
  supabase: SupabaseServiceClient,
  lsSubscriptionId: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("subscriptions")
      .update({ trial_converted_at: new Date().toISOString() })
      .eq("ls_subscription_id", lsSubscriptionId)
      .not("trial_started_at", "is", null)
      .is("trial_converted_at", null);
    if (error) {
      console.error("stampTrialConversion: update failed", error);
    }
  } catch (error) {
    console.error("stampTrialConversion threw", error);
  }
}

/**
 * Belt-and-suspenders for the checkout double-subscribe guard. When a new
 * non-addon subscription is created for a user, cancel any OTHER trial
 * subscriptions they still have running. Without this, a user who (re)subscribes
 * while a previous trial is still live ends up with multiple parallel trials,
 * each of which would independently convert to its own paid charge at its own
 * trial-end - the exact duplicate-"Initial payment" mess the guard exists to
 * prevent, for the cases the guard can't catch (guest/manual LS-dashboard
 * checkouts, or a pre-guard race).
 *
 * Only ever cancels trials, never a paid 'active' sub and never the Daily Deals
 * add-on (which is 'active', so already excluded by the status filter).
 * Cancelling a trial in LS stops it converting to paid; the resulting
 * subscription_cancelled webhook reconciles the row, but we also mark it here so
 * the dashboard is correct immediately. Best-effort throughout: a failure to
 * cancel one stale trial must never fail the whole webhook.
 */
async function supersedeStaleTrials(
  supabase: SupabaseServiceClient,
  userId: string,
  keepLsSubscriptionId: string,
): Promise<void> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("ls_subscription_id")
    .eq("user_id", userId)
    .eq("status", "on_trial")
    .neq("ls_subscription_id", keepLsSubscriptionId);

  if (error) {
    console.error("supersedeStaleTrials: lookup failed", error.message);
    return;
  }

  const staleIds = (data ?? [])
    .map((r) => getString((r as { ls_subscription_id?: unknown }).ls_subscription_id))
    .filter((id): id is string => id != null);

  for (const staleId of staleIds) {
    try {
      // DELETE cancels the subscription; for a trial it means "won't convert to
      // paid". A 404 means LS already has no such live sub - treat as done.
      const res = await lsApi(`/subscriptions/${encodeURIComponent(staleId)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 404) {
        const text = await res.text().catch(() => "");
        console.error("supersedeStaleTrials: LS cancel failed", {
          staleId,
          status: res.status,
          text: text.slice(0, 300),
        });
        continue; // leave the local row; the periodic reconcile can retry
      }
      // Mark locally right away so the dashboard doesn't show two trials until
      // the subscription_cancelled webhook lands. ends_at is filled in by that
      // webhook (it carries the authoritative trial-end/cancel timestamp).
      const { error: updateError } = await supabase
        .from("subscriptions")
        .update({ status: "cancelled" })
        .eq("ls_subscription_id", staleId);
      if (updateError) {
        console.error("supersedeStaleTrials: local mark failed", {
          staleId,
          message: updateError.message,
        });
      }
    } catch (err) {
      console.error("supersedeStaleTrials: threw", { staleId, err });
    }
  }
}

/**
 * Analytics capture: store the order's discount total and (when a discount
 * was applied) resolve the code via the LS discount-redemptions API - the
 * order payload itself never carries the code. Best-effort on every step:
 * LS downtime or a missing column (manually-applied migration 20260704) must
 * never affect webhook processing. An empty redemption result is an accepted
 * loss - the redemption record can lag the order webhook by a moment.
 */
async function captureOrderDiscount(
  supabase: SupabaseServiceClient,
  lsOrderId: string,
  discountTotal: unknown,
): Promise<void> {
  const totalCents = typeof discountTotal === "number" ? discountTotal : Number(discountTotal);
  if (!Number.isFinite(totalCents)) return;

  try {
    const { error } = await supabase
      .from("orders")
      .update({ discount_total_cents: totalCents })
      .eq("ls_order_id", lsOrderId);
    if (error) {
      console.error("captureOrderDiscount: total update failed", error);
      return;
    }
  } catch (error) {
    console.error("captureOrderDiscount: total update threw", error);
    return;
  }

  if (totalCents <= 0) return;

  try {
    const response = await lsApi(
      `/discount-redemptions?filter[order_id]=${encodeURIComponent(lsOrderId)}&page[size]=1`,
      { method: "GET" },
    );
    if (!response.ok) {
      console.error("captureOrderDiscount: redemptions lookup failed", {
        status: response.status,
        lsOrderId,
      });
      return;
    }
    const payload = (await response.json()) as {
      data?: { attributes?: { discount_code?: string | null } }[];
    };
    const code = payload.data?.[0]?.attributes?.discount_code ?? null;
    if (!code) return;

    const { error } = await supabase
      .from("orders")
      .update({ discount_code: code })
      .eq("ls_order_id", lsOrderId);
    if (error) {
      console.error("captureOrderDiscount: code update failed", error);
    }
  } catch (error) {
    console.error("captureOrderDiscount: code resolution threw", error);
  }
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

  // Use the canonical supabase-js admin client rather than @supabase/ssr's
  // createServerClient. SSR's client is tuned for cookie-bound user auth and
  // doesn't always route writes as the service_role JWT claim - so RLS can
  // silently filter inserts (returns data: [], error: null, no row written).
  // supabase-js with autoRefreshToken/persistSession off reliably bypasses RLS.
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as unknown as SupabaseServiceClient;

  let payload: LsWebhookPayload;

  try {
    payload = JSON.parse(rawBody) as LsWebhookPayload;
  } catch (error) {
    console.error("Invalid Lemon Squeezy webhook payload", error);
    // Signature already verified, so this is a legitimate-but-broken delivery
    // worth a log row. logWebhookEvent never throws.
    await logWebhookEvent({
      eventName: null,
      recordId: null,
      status: "error",
      errorMessage: "invalid json payload",
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventName = payload.meta?.event_name;
  const attrs = payload.data?.attributes ?? {};
  const recordId = getString(payload.data?.id);
  const directUserId = getString(payload.meta?.custom_data?.supabase_user_id);
  // Per-purchase identifier set as a cookie before LS checkout. Stored on
  // orders.welcome_token so /api/welcome/license can return the right license
  // key to the buyer on the thank-you page without requiring auth.
  // See src/lib/welcome-token.ts.
  const welcomeToken = getString(payload.meta?.custom_data?.welcome_token);
  // Intended affiliate captured at checkout (set by the checkout routes via
  // affiliateCaptureCustom). Persisted on order_created so a referral made
  // during the pre-LS-activation gap can be reconciled and paid once the
  // affiliate goes live. status 'pending' = LS did NOT credit (owe a manual
  // bonus); 'live' = aff_ref already credited LS (informational only).
  const refAffiliateUserId = getString(payload.meta?.custom_data?.ref_affiliate_user_id);
  const refAffiliateCode = getString(payload.meta?.custom_data?.ref_affiliate_code);
  const refAttributionStatusRaw = getString(payload.meta?.custom_data?.ref_attribution_status);
  const refAttributionStatus =
    refAttributionStatusRaw === "live" || refAttributionStatusRaw === "pending"
      ? refAttributionStatusRaw
      : null;
  // Meta Pixel browser identifiers stamped into checkout custom_data by the
  // checkout routes. Renewal orders carry no custom_data, so these are null
  // there and the Conversions API events match on email/external_id only.
  const metaFbp = getString(payload.meta?.custom_data?.fbp);
  const metaFbc = getString(payload.meta?.custom_data?.fbc);
  // Advertising consent stamped by the checkout routes. The Conversions API
  // Purchase/StartTrial events only fire when the buyer consented; renewals
  // carry no custom_data (so no meta_consent) and are intentionally skipped
  // rather than sent without a consent record.
  const metaConsent = getString(payload.meta?.custom_data?.meta_consent) === "1";

  const handlers: Record<string, () => Promise<void>> = {
    order_created: async () => {
      if (!recordId) {
        throw new Error("order_created: missing data.id (recordId)");
      }

      const lsCustomerId = getIdString(attrs.customer_id);
      const orderEmail = getString(attrs.user_email);

      // Payment-first flow: when the CTA used the guest checkout, there is no
      // supabase_user_id in custom_data. Provision the user from the order's
      // email and send a magic-link welcome email on first provisioning.
      const userId =
        directUserId ??
        (orderEmail ? await ensureUserForEmail(supabase, orderEmail, { lsCustomerId }) : null);
      if (!userId) {
        throw new Error(
          `order_created: no user context - directUserId=${directUserId ?? "null"}, orderEmail=${orderEmail ?? "null"}, lsCustomerId=${lsCustomerId ?? "null"}`,
        );
      }

      await recordExists(supabase, "orders", "ls_order_id", recordId);

      await assertWrite(
        "orders.upsert(order_created)",
        supabase.from("orders").upsert(
          {
            ls_order_id: recordId,
            user_id: userId,
            status: getString(attrs.status),
            total: attrs.total ?? null,
            currency: getString(attrs.currency),
            // Only include welcome_token if this delivery actually carries one
            // (manual LS dashboard checkouts won't), so we don't blank out a
            // previously-stamped token on a re-delivery.
            ...(welcomeToken ? { welcome_token: welcomeToken } : {}),
            // Same null-guard for the captured affiliate: only write when this
            // delivery carries it, so a re-delivery never blanks a prior value.
            ...(refAffiliateUserId ? { ref_affiliate_user_id: refAffiliateUserId } : {}),
            ...(refAffiliateCode ? { ref_affiliate_code: refAffiliateCode } : {}),
            ...(refAttributionStatus ? { attribution_status: refAttributionStatus } : {}),
          },
          { onConflict: "ls_order_id" },
        ),
      );

      // Analytics only - never throws, never blocks order processing.
      await captureOrderDiscount(supabase, recordId, attrs.discount_total);

      if (lsCustomerId) {
        await assertWrite(
          "profiles.update(ls_customer_id null-guard)",
          supabase
            .from("profiles")
            .update({ ls_customer_id: lsCustomerId })
            .eq("id", userId)
            .is("ls_customer_id", null),
        );
      }

      // Record the purchase for the public recent-activity widget. Best-effort
      // and non-throwing so it can never break order processing. Location comes
      // from the geo we stashed at checkout (welcome_token for guests, user:<id>
      // for authed buyers); first name from the Lemon Squeezy order.
      const firstItem = attrs.first_order_item as
        | { variant_name?: unknown; product_name?: unknown }
        | undefined;
      void logPurchaseActivity({
        geoKey: welcomeToken ?? (directUserId ? `user:${directUserId}` : null),
        firstName: firstNameFrom(getString(attrs.user_name)),
        planLabel:
          getString(firstItem?.variant_name) ?? getString(firstItem?.product_name),
      });

      // Meta Conversions API Purchase for lookalike seeding. Deterministic
      // event_id (the LS order id) turns LS webhook retries into a Meta-side
      // dedup (48h window), so no DB guard or new migration is needed. $0
      // orders (the trial-start order) are skipped: StartTrial covers that
      // moment and a value-0 Purchase would pollute the seed. Renewals fire
      // again on purpose: repeat purchasers are the best seed. No ip/ua here:
      // this request comes from Lemon Squeezy's server, not the buyer.
      if (metaConsent && typeof attrs.total === "number" && attrs.total > 0) {
        const buyerName = getString(attrs.user_name);
        const nameSplitIdx = buyerName ? buyerName.indexOf(" ") : -1;
        void sendMetaEvent({
          eventName: "Purchase",
          eventId: `purchase-${recordId}`,
          userData: {
            email: orderEmail,
            firstName: firstNameFrom(buyerName),
            lastName:
              buyerName && nameSplitIdx > 0
                ? buyerName.slice(nameSplitIdx + 1).trim() || null
                : null,
            externalId: userId,
            fbp: metaFbp,
            fbc: metaFbc,
          },
          customData: {
            value: attrs.total / 100,
            currency: (getString(attrs.currency) ?? "USD").toUpperCase(),
            content_name:
              getString(firstItem?.variant_name) ?? getString(firstItem?.product_name) ?? "order",
          },
        });
      }
    },

    // Mirror LS refunds onto orders.status so the owed-commissions report
    // (which filters status='paid') stops counting a gap-window referral once
    // it's refunded - otherwise we'd back-pay commission on money that was
    // returned. LS sends the new status ('refunded' or 'partial_refund') in the
    // payload; we only update an existing row (no upsert) so a stray refund
    // event for an unknown order is a no-op rather than a phantom insert.
    //
    // Clawback: if we had ALREADY paid the affiliate commission on this order
    // (reconciled_amount_cents > 0), flipping status is not enough - the money is
    // gone. Record a negative, open affiliate_commission_adjustments row for what
    // we paid, so the next automated disburse nets it back. Idempotent on the
    // order id (related_customer) so a re-delivered refund event never doubles it.
    order_refunded: async () => {
      if (!recordId) return;

      // Read the order first so we know whether commission was already paid and
      // who the referring affiliate was.
      const { data: existingOrder } = await supabase
        .from("orders")
        .select("ref_affiliate_user_id,reconciled_amount_cents,currency")
        .eq("ls_order_id", recordId)
        .maybeSingle();

      await assertWrite(
        "orders.update(order_refunded)",
        supabase
          .from("orders")
          .update({ status: getString(attrs.status) ?? "refunded" })
          .eq("ls_order_id", recordId),
      );

      const affiliateUserId =
        typeof existingOrder?.ref_affiliate_user_id === "string"
          ? existingOrder.ref_affiliate_user_id
          : null;
      const paidCents =
        typeof existingOrder?.reconciled_amount_cents === "number"
          ? existingOrder.reconciled_amount_cents
          : 0;
      if (!affiliateUserId || paidCents <= 0) return; // nothing was paid -> no clawback

      // Idempotency: skip if a clawback for this order already exists. Filter the
      // negative amount in JS (the typed client only chains .eq here).
      const { data: prior } = await supabase
        .from("affiliate_commission_adjustments")
        .select("id,amount_cents")
        .eq("related_customer", recordId);
      if (
        Array.isArray(prior) &&
        prior.some((r) => typeof r.amount_cents === "number" && r.amount_cents < 0)
      ) {
        return;
      }

      await assertWrite(
        "affiliate_commission_adjustments.insert(clawback)",
        supabase.from("affiliate_commission_adjustments").insert({
          user_id: affiliateUserId,
          amount_cents: -paidCents,
          currency:
            typeof existingOrder?.currency === "string" ? existingOrder.currency : "USD",
          note: `Refund/chargeback clawback on order ${recordId}`,
          // 'manual' keeps within the source CHECK constraint (makewhole|manual);
          // related_customer carries the order id for idempotency + admin context.
          source: "manual",
          related_customer: recordId,
          created_by: "ls-webhook:order_refunded",
        }),
      );
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
          `subscription_created: no user context - directUserId=${directUserId ?? "null"}, subEmail=${subEmail ?? "null"}`,
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
        // Durably record the referring affiliate so every renewal order can be
        // credited to them (renewals carry no custom_data). Only write when this
        // delivery actually carries it, so a re-delivery never blanks it.
        ...(refAffiliateUserId ? { ref_affiliate_user_id: refAffiliateUserId } : {}),
        ...(refAffiliateCode ? { ref_affiliate_code: refAffiliateCode } : {}),
        ...(refAttributionStatus ? { attribution_status: refAttributionStatus } : {}),
      };

      // Phase F (2026-05-20): never mint trial discounts on add-on
      // subscriptions. The Daily Deals Workspace add-on has no trial and
      // accepts no promo or affiliate codes - feeding it through
      // mintTrialDiscounts would create LS discount records that
      // technically apply (per LS, when no variantIds scope is set),
      // contradicting belt 3 of the promo-exclusion contract.
      const isAddonSubscription =
        attrs.variant_id != null
        && process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON != null
        && String(attrs.variant_id) === String(process.env.LEMONSQUEEZY_VARIANT_DAILY_DEALS_ADDON);

      if (isTrial && !isAddonSubscription) {
        basePayload.trial_started_at = new Date().toISOString();

        // No-stacking: do not mint a member trial discount when the customer
        // already redeemed one at checkout. The referring-affiliate stamp on
        // this very delivery is the most reliable signal (the trial-start order
        // may not have landed yet); hasRedeemedDiscount also catches a
        // welcome/promo code once the order row exists.
        const alreadyDiscounted =
          Boolean(refAffiliateUserId || refAffiliateCode) ||
          (await hasRedeemedDiscount(supabase, userId));

        if (!alreadyDiscounted) {
          const trialDiscounts = await mintTrialDiscounts({
            trialEndsAt,
            userId,
          });
          if (trialDiscounts) {
            Object.assign(basePayload, trialDiscounts);
          }
        }

        // Meta Conversions API StartTrial: the $0 trial-start order fires no
        // Purchase (see order_created), so this is the trial moment's
        // audience signal. Deterministic event_id (the LS subscription id)
        // turns webhook retries into a Meta-side dedup. Gated on the consent
        // flag stamped at checkout.
        if (metaConsent) {
          void sendMetaEvent({
            eventName: "StartTrial",
            eventId: `trial-${recordId}`,
            userData: { email: subEmail, externalId: userId, fbp: metaFbp, fbc: metaFbc },
            customData: {
              content_name:
                getString(attrs.product_name) ?? getString(attrs.variant_name) ?? "trial",
            },
          });
        }
      } else if (status === "active" && !isAddonSubscription) {
        // Direct Pro subscriber: paid from day one, no free trial. Anchor the
        // Pro welcome + nurture sequence (sendProEmails in the affiliate-funnel
        // cron) so they get a "thanks for subscribing" track instead of the
        // trial sequence. Set only at creation time and only for status
        // 'active', so a trial that later converts to active is NOT pulled into
        // this track (it already received the trial emails). Add-on
        // subscriptions (Daily Deals Workspace) are also 'active' but excluded.
        basePayload.pro_started_at = new Date().toISOString();
      }

      await assertWrite(
        "subscriptions.upsert(subscription_created)",
        supabase.from("subscriptions").upsert(basePayload, {
          onConflict: "ls_subscription_id",
        }),
      );

      // Backfill license rows that arrived before this subscription existed.
      // order_created/subscription_created/license_key_created are independent
      // webhook deliveries that can race; when license_key_created wins, the
      // license lands with a null subscription_id (it couldn't resolve the
      // not-yet-written subscription). Link this user's orphaned licenses now.
      // Already-linked rows are left untouched (the `is(subscription_id, null)`
      // guard), so this is a safe no-op in the common in-order case.
      const createdSubscription = await findSubscriptionByLsId(supabase, recordId);
      if (createdSubscription.id) {
        await assertWrite(
          "license_keys.update(backfill subscription_id)",
          supabase
            .from("license_keys")
            .update({ subscription_id: createdSubscription.id })
            .eq("user_id", userId)
            .is("subscription_id", null),
        );
      }

      // Cancel any lingering trials this user still has, so a fresh subscription
      // doesn't leave a second trial running that would later bill separately.
      // Only fires for a new live non-addon sub; only cancels trials.
      if (!isAddonSubscription && (status === "on_trial" || status === "active")) {
        await supersedeStaleTrials(supabase, userId, recordId);
      }

      // Consumer referral: a direct paid signup (active from day one) by a
      // referred friend rewards their referrer. Gated + idempotent inside;
      // best-effort so it never fails the webhook. Trials reward later, on the
      // subscription_updated -> active conversion below.
      if (status === "active" && !isAddonSubscription) {
        await rewardReferrerForSubscription(recordId);
      }
    },

    subscription_updated: async () => {
      if (!recordId) return;
      await assertWrite(
        "subscriptions.update(subscription_updated)",
        supabase
          .from("subscriptions")
          .update({
            status: getString(attrs.status),
            renews_at: attrs.renews_at ?? null,
            ends_at: attrs.ends_at ?? null,
            // Keep plan/variant in sync so a mid-cycle plan change (e.g.
            // monthly -> annual via /api/subscription/upgrade) is reflected on
            // the dashboard. LS carries the current variant/product on every
            // update, so overwriting with these values is idempotent.
            plan_name: getString(attrs.product_name) ?? getString(attrs.variant_name),
            ls_product_id: attrs.product_id ?? null,
            ls_variant_id: attrs.variant_id ?? null,
          })
          .eq("ls_subscription_id", recordId),
      );

      // A trial reporting 'active' has just converted to paid. Best-effort
      // analytics stamp; guards inside make it idempotent and trials-only.
      if (getString(attrs.status) === "active") {
        await stampTrialConversion(supabase, recordId);
        // A referred friend's trial just converted to paid: reward the referrer.
        await rewardReferrerForSubscription(recordId);
      }

      // Seat resync after a plan change: LS does not reliably re-apply the new
      // product's activation_limit to an existing license key on a variant
      // swap, so bring the key's device cap in line with the tier ourselves.
      // Mismatch-gated (zero LS calls in the steady state) and best-effort: a
      // resync failure must never fail the webhook.
      try {
        const plan = planForVariantId(getIdString(attrs.variant_id));
        const tier = tierForPlan(plan);
        if (tier) {
          const expected = SEAT_LIMIT[tier];
          const { id: subId } = await findSubscriptionByLsId(supabase, recordId);
          if (subId) {
            const { data: keys } = await supabase
              .from("license_keys")
              .select("ls_license_key_id,status,activation_limit,created_at")
              .eq("subscription_id", subId);
            const rows = ((keys ?? []) as {
              ls_license_key_id?: string | null;
              status?: string | null;
              activation_limit?: number | null;
              created_at?: string | null;
            }[]).sort(
              // Newest first, so the fallback below matches "prefer active,
              // then newest" everywhere else license keys are picked.
              (a, b) =>
                new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
            );
            const active = rows.find((k) => k.status === "active") ?? rows[0];
            if (
              active?.ls_license_key_id &&
              active.activation_limit !== expected
            ) {
              const patched = await setLicenseKeyActivationLimit(
                active.ls_license_key_id,
                expected,
              );
              if (patched) {
                await supabase
                  .from("license_keys")
                  .update({ activation_limit: expected })
                  .eq("ls_license_key_id", active.ls_license_key_id);
              }
            }
          }
        }
      } catch (error) {
        console.error("subscription_updated: seat resync failed", error);
      }
    },

    subscription_cancelled: async () => {
      if (!recordId) return;
      await assertWrite(
        "subscriptions.update(subscription_cancelled)",
        supabase
          .from("subscriptions")
          .update({
            status: "cancelled",
            ends_at: attrs.ends_at ?? attrs.cancelled_at ?? null,
          })
          .eq("ls_subscription_id", recordId),
      );

      // If this cancellation never went through our in-app funnel (which would
      // have left a subscription_cancel_reasons row), email a one-question
      // survey so no churn goes unmeasured. Best-effort: never fail the webhook.
      try {
        const alreadySurveyed = await recordExists(
          supabase,
          "subscription_cancel_reasons",
          "subscription_id",
          recordId,
        );
        if (!alreadySurveyed) {
          const { userId } = await findSubscriptionByLsId(supabase, recordId);
          const email = getString(attrs.user_email);
          if (userId && email) {
            const token = randomUUID();
            const { error: insertError } = await supabase
              .from("subscription_cancel_reasons")
              .insert({
                user_id: userId,
                subscription_id: recordId,
                reason: "unspecified",
                source: "email",
                survey_token: token,
                emailed_at: new Date().toISOString(),
                offer_shown: false,
                offer_accepted: false,
              });
            if (!insertError) {
              await sendCancelSurveyEmail({
                to: email,
                token,
                name: firstNameFrom(getString(attrs.user_name)),
              });
            } else {
              console.error("cancel-survey pending insert failed", insertError);
            }
          }
        }
      } catch (surveyErr) {
        console.error("cancel-survey email side effect failed", surveyErr);
      }
    },

    subscription_paused: async () => {
      if (!recordId) return;
      await assertWrite(
        "subscriptions.update(subscription_paused)",
        supabase
          .from("subscriptions")
          .update({ status: "paused" })
          .eq("ls_subscription_id", recordId),
      );
    },

    subscription_resumed: async () => {
      if (!recordId) return;
      await assertWrite(
        "subscriptions.update(subscription_resumed)",
        supabase
          .from("subscriptions")
          .update({ status: "active" })
          .eq("ls_subscription_id", recordId),
      );
    },

    subscription_payment_success: async () => {
      const renewalOrderId = getIdString(attrs.order_id) ?? recordId;
      if (!renewalOrderId) return;

      const lsSubscriptionId = getIdString(attrs.subscription_id);
      // Recover the subscription's stored affiliate attribution: renewal
      // webhooks carry no custom_data, so without this the referring affiliate
      // would be lost on every renewal (breaking recurring/lifetime payouts).
      const sub = lsSubscriptionId
        ? await findSubscriptionAttribution(supabase, lsSubscriptionId)
        : { userId: null, refAffiliateUserId: null, refAffiliateCode: null, attributionStatus: null };
      const userId = directUserId || sub.userId;

      if (!userId) {
        throw new Error(
          `subscription_payment_success: no user context for sub=${lsSubscriptionId ?? "null"}`,
        );
      }

      await recordExists(supabase, "orders", "ls_order_id", renewalOrderId);

      await assertWrite(
        "orders.upsert(subscription_payment_success)",
        supabase.from("orders").upsert(
          {
            ls_order_id: renewalOrderId,
            user_id: userId,
            status: getString(attrs.status) ?? "paid",
            total: attrs.total ?? null,
            currency: getString(attrs.currency),
            ...(lsSubscriptionId ? { ls_subscription_id: lsSubscriptionId } : {}),
            // Carry the affiliate forward from the subscription so this renewal
            // is credited. Copying the origin attribution_status is correct:
            // pending-origin subs owe the full rate on every renewal, live ones
            // get the 30%-credited treatment (and past 12mo the commission
            // engine computes LS paid = 0, so lifetime renewals owe the full rate).
            ...(sub.refAffiliateUserId ? { ref_affiliate_user_id: sub.refAffiliateUserId } : {}),
            ...(sub.refAffiliateCode ? { ref_affiliate_code: sub.refAffiliateCode } : {}),
            ...(sub.attributionStatus ? { attribution_status: sub.attributionStatus } : {}),
          },
          { onConflict: "ls_order_id" },
        ),
      );

      // Analytics only - never throws, never blocks renewal processing.
      // A successful payment on a trial subscription is also its conversion
      // moment (belt-and-braces alongside subscription_updated).
      await captureOrderDiscount(supabase, renewalOrderId, attrs.discount_total);
      if (lsSubscriptionId) {
        await stampTrialConversion(supabase, lsSubscriptionId);
      }
    },

    subscription_payment_failed: async () => {
      const lsSubscriptionId = getIdString(attrs.subscription_id) ?? recordId;
      if (!lsSubscriptionId) return;
      await assertWrite(
        "subscriptions.update(subscription_payment_failed)",
        supabase
          .from("subscriptions")
          .update({ status: "past_due" })
          .eq("ls_subscription_id", lsSubscriptionId),
      );
    },

    affiliate_activated: async () => {
      if (!recordId) return;

      const rawEmail =
        getString(attrs.user_email) ??
        getString((attrs as Record<string, unknown>).email);
      if (!rawEmail) {
        console.error("affiliate_activated: no email in webhook payload");
        return;
      }
      const email = rawEmail.toLowerCase();

      // Resolve the user via the affiliate application first (the funnel path),
      // then fall back to profiles.email (direct-LS signup with an existing
      // Influencer Butler account), and finally to auth.users (existing auth
      // user with no profile row yet). If all three miss, the affiliate signed
      // up at LS without ever touching our site - create a stub user + minimal
      // application row so they're not orphaned. This is the silent-failure
      // class that left 3 approvals un-upserted for a month.
      let userId: string | null = null;

      const { data: appData } = await supabase
        .from("affiliate_applications")
        .select("user_id")
        .ilike("email", email)
        .maybeSingle();
      userId = getString(appData?.user_id);

      if (!userId) {
        userId = await findUserIdByEmail(supabase, email);
        if (userId) {
          console.info(
            "affiliate_activated: matched via profiles.email fallback (no application row)",
            { email, userId },
          );
        }
      }

      if (!userId) {
        try {
          const { data: listData } = await supabase.auth.admin.listUsers({
            page: 1,
            perPage: 200,
          });
          const authUser = listData?.users?.find(
            (u) => (u.email ?? "").toLowerCase() === email,
          );
          userId = getString(authUser?.id);
          if (userId) {
            console.info(
              "affiliate_activated: matched via auth.users fallback (no profile or application row)",
              { email, userId },
            );
          }
        } catch (err) {
          console.error("affiliate_activated: auth.users lookup threw", err);
        }
      }

      if (!userId) {
        console.warn(
          "affiliate_activated: no matching account anywhere - provisioning stub user",
          { email },
        );
        userId = await ensureUserForEmail(supabase, email);
        if (!userId) {
          console.error(
            "affiliate_activated: stub provisioning failed; affiliate is orphaned",
            { email, recordId },
          );
          return;
        }
        // Drop a minimal application row so the dashboard's email-based lookup
        // (src/app/dashboard/affiliates/page.tsx) can find them.
        await assertWrite(
          "affiliate_applications.upsert(direct-ls-stub)",
          supabase.from("affiliate_applications").upsert(
            {
              user_id: userId,
              email,
              full_name: email.split("@")[0] ?? "Affiliate",
              promotion_strategy:
                "Direct Lemon Squeezy affiliate signup (no apply form submitted).",
              agreed_to_terms: true,
              status: "approved",
              auto_approved: true,
              admin_notes: "Stub row - direct LS signup, bypassed our funnel.",
              reviewed_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          ),
        );
      }

      await assertWrite(
        "profiles.upsert(affiliate_activated)",
        supabase.from("profiles").upsert(
          {
            id: userId,
            is_affiliate: true,
            ls_affiliate_id: recordId,
          },
          { onConflict: "id" },
        ),
      );

      // LS exposes no activation timestamp, so stamp our own the FIRST time we
      // learn they are active. The is(null) guard keeps the original date if
      // affiliate_activated is re-delivered.
      await assertWrite(
        "profiles.update(ls_activated_at first-time)",
        supabase
          .from("profiles")
          .update({ ls_activated_at: new Date().toISOString() })
          .eq("id", userId)
          .is("ls_activated_at", null),
      );
    },

    license_key_created: async () => {
      if (!recordId) return;

      const lsSubscriptionId = getIdString(attrs.subscription_id);
      const subscription = lsSubscriptionId
        ? await findSubscriptionByLsId(supabase, lsSubscriptionId)
        : { id: null, userId: null };
      const userId = directUserId || subscription.userId;

      if (!userId) {
        throw new Error(
          `license_key_created: no user context for sub=${lsSubscriptionId ?? "null"}`,
        );
      }

      await recordExists(supabase, "license_keys", "ls_license_key_id", recordId);

      const licenseKeyString = getString(attrs.key);
      await assertWrite(
        "license_keys.upsert(license_key_created)",
        supabase.from("license_keys").upsert(
          {
            ls_license_key_id: recordId,
            user_id: userId,
            // FK to subscriptions.id (the internal uuid), which
            // /api/welcome/license joins on. Resolved from the LS subscription
            // id; the column is subscription_id, not ls_subscription_id.
            subscription_id: subscription.id,
            key: licenseKeyString,
            key_hash: sha256Hex(licenseKeyString),
            status: getString(attrs.status),
            activation_limit: attrs.activation_limit ?? null,
          },
          { onConflict: "ls_license_key_id" },
        ),
      );
    },

    license_key_updated: async () => {
      if (!recordId) return;
      // Also resync activation_limit so an LS-side seat change (plan switch,
      // manual edit in the LS dashboard) self-heals our mirror. Only written
      // when present in the payload.
      const updatedLimit = attrs.activation_limit;
      await assertWrite(
        "license_keys.update(license_key_updated)",
        supabase
          .from("license_keys")
          .update({
            status: getString(attrs.status),
            ...(typeof updatedLimit === "number" ? { activation_limit: updatedLimit } : {}),
          })
          .eq("ls_license_key_id", recordId),
      );
    },
  };

  const handler = eventName ? handlers[eventName] : undefined;

  // Delivery-log context; logWebhookEvent is best-effort and never throws.
  const userHint = directUserId ?? getString(attrs.user_email);

  if (!handler) {
    await logWebhookEvent({
      eventName: eventName ?? null,
      recordId: recordId ?? null,
      userHint,
      status: "skipped",
      payload,
    });
    return NextResponse.json({ received: true, note: `no handler for ${eventName ?? "missing event_name"}` });
  }

  // Echo handler errors back into the 200 response body so they surface in the
  // LS "Recent deliveries" UI - we can't tail Vercel logs from every context,
  // and silently returning {received:true} meant 6 consecutive webhooks could
  // fail while LS showed green checkmarks. Still returns 200 so LS doesn't
  // retry-loop; if the fix needs a re-run, use LS's "Resend" button manually.
  const startedAt = Date.now();
  try {
    await handler();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack?.split("\n").slice(0, 4).join(" | ") : undefined;
    console.error(`Lemon Squeezy webhook event handling failed for ${eventName}`, error);
    await logWebhookEvent({
      eventName: eventName ?? null,
      recordId: recordId ?? null,
      userHint,
      status: "error",
      errorMessage: stack ? `${message} | ${stack}` : message,
      durationMs: Date.now() - startedAt,
      payload,
    });
    return NextResponse.json({
      received: true,
      handler_error: { event: eventName, message, stack },
    });
  }

  await logWebhookEvent({
    eventName: eventName ?? null,
    recordId: recordId ?? null,
    userHint,
    status: "processed",
    durationMs: Date.now() - startedAt,
    payload,
  });

  return NextResponse.json({ received: true, event: eventName });
}
