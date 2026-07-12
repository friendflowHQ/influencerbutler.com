/**
 * In-house comp issuance: grant a recipient free Pro access entirely in
 * Supabase, with NO Lemon Squeezy subscription.
 *
 * Why this is possible: Pro is granted solely by a `subscriptions` row (status
 * active/on_trial/past_due/paused) for a user_id, read by /api/entitlements via
 * the service-role client. The desktop app resolves the bearer license key
 * against our `license_keys.key_hash` and reads that subscription - it never
 * calls the LS license API. So minting a key + a synthetic subscription row here
 * unlocks Pro end-to-end without LS ever hearing about it.
 *
 * What this writes (all via the service-role admin client):
 *   1. an auth user + profiles row for the recipient (created if missing);
 *   2. a `subscriptions` row, status 'active', with a sentinel
 *      ls_subscription_id `comp:<uuid>` (that column is UNIQUE and may be NOT
 *      NULL in prod - the sentinel satisfies both) -> grants Pro immediately;
 *   3. a `license_keys` row (key + key_hash) -> the recipient's activation key;
 *   4. a `comp_grants` row, source 'in_house' -> tracked on the Comps page and
 *      cancelled by flipping the Supabase status (see comps-cancel.ts).
 * Then it emails the recipient their key + download + sign-in links.
 *
 * Cancellation and the expiry cron are handled elsewhere; this module only
 * issues.
 */
import { randomUUID } from "crypto";
import { adminService, type AdminService } from "@/lib/admin-service";
import { hashLicenseKey } from "@/lib/license-auth";
import { addMonthsUtc, FOREVER_TOKEN, COMP_PLACEHOLDER_DOMAIN } from "@/lib/comp-codes";
import { SEAT_LIMIT, TIER_NAME, tierForPlan, ADDON_PLAN_DAILY_DEALS } from "@/lib/pricing-constants";
import { resolveVariantId } from "@/lib/lemonsqueezy";

export type IssueCompInput = {
  /**
   * Recipient email, or empty/null to mint an UNASSIGNED comp (a spare key the
   * admin hands out later). Unassigned comps get a placeholder identity and are
   * not emailed; whoever holds the key can still activate the desktop app.
   */
  email?: string | null;
  name?: string | null;
  /** Free-window length in months, or null for a never-expiring (forever) comp. */
  months: number | null;
  plan: string;
  /**
   * Devices allowed on the key at once (the license_keys.activation_limit).
   * Omitted -> the plan's default seat count (Solo 1 / Team 10 / Agency 25,
   * Daily Deals add-on 1).
   */
  seats?: number | null;
  /** When true, the comp never expires and is never auto-cancelled. */
  forever?: boolean;
  /**
   * When true, skip the "account already has a live subscription" guard and
   * stack this comp on top anyway. Entitlements read the newest subscription, so
   * a fresh comp takes effect and its own expiry cron only cancels this row.
   */
  allowExisting?: boolean;
};

export type IssueCompResult =
  | {
      ok: true;
      key: string;
      userId: string;
      /** The recipient email, or null for an unassigned (no-recipient) comp. */
      email: string | null;
      expiresAt: string | null;
      activationLimit: number;
    }
  | { ok: false; status: number; error: string };

// Statuses that mean the user already has live access, so we must not stack a
// second grant on top (mirrors the entitlement Pro set + trial).
const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];

/** Uppercase A-Z0-9 only, capped, for the <NAME> segment of the synthetic code. */
function codeNameSegment(name: string | null | undefined, email: string): string {
  const source = (name && name.trim()) || email.split("@")[0] || "USER";
  const cleaned = source.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  return cleaned || "USER";
}

/** Find an existing auth user id by email via the admin listUsers API. */
async function findAuthUserIdByEmail(svc: AdminService, email: string): Promise<string | null> {
  const target = email.toLowerCase();
  try {
    const { data, error } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
    if (error || !data?.users) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === target);
    return match?.id ?? null;
  } catch (err) {
    console.error("comp-issue: listUsers threw", err);
    return null;
  }
}

/**
 * Resolve or create the recipient's Supabase user + profiles row. Deliberately
 * lighter than the webhook's ensureUserForEmail (no welcome-email machinery) -
 * the comp email is sent separately with comp-specific copy.
 */
async function ensureCompUser(
  svc: AdminService,
  email: string,
  name: string | null | undefined,
): Promise<string | null> {
  const existing = await svc.from("profiles").select("id").eq("email", email).maybeSingle();
  const existingId = existing.data?.id;
  if (typeof existingId === "string" && existingId) return existingId;

  const created = await svc.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { created_via: "comp", ...(name ? { name } : {}) },
  });
  let userId = created.data.user?.id ?? null;

  // createUser fails if an auth user already exists (e.g. an affiliate applicant
  // with no profile row). Fall back to listUsers and backfill the profile.
  if (!userId) userId = await findAuthUserIdByEmail(svc, email);
  if (!userId) {
    console.error("comp-issue: could not create or find user", { email });
    return null;
  }

  const prof = await svc.from("profiles").upsert({ id: userId, email }, { onConflict: "id" });
  if (prof.error) console.error("comp-issue: profiles upsert failed", prof.error);
  return userId;
}

/** Best-effort transactional email with the key + download + sign-in links. */
async function sendCompEmail(params: {
  to: string;
  key: string;
  months: number | null;
  forever: boolean;
  signInLink: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("comp-issue: RESEND_API_KEY not set - comp email skipped");
    return;
  }
  const siteUrl = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");

  const durationPhrase =
    params.forever || params.months == null
      ? "Influencer Butler Pro, free forever"
      : `${params.months} month${params.months === 1 ? "" : "s"} of Influencer Butler Pro, free`;

  const lines = [
    `Great news: you have been given ${durationPhrase}.`,
    ``,
    `Your license key:`,
    ``,
    `    ${params.key}`,
    ``,
    `1. Download the desktop app: ${siteUrl}/download`,
    `2. Open it and paste the license key above when prompted.`,
  ];
  if (params.signInLink) {
    lines.push(
      ``,
      `To manage your account on the web, use this sign-in link (it logs you in automatically):`,
      ``,
      `    ${params.signInLink}`,
    );
  }
  lines.push(
    ``,
    `Questions? Just reply to this email and a real human will answer.`,
    ``,
    `- The Influencer Butler team`,
  );

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Influencer Butler <hello@influencerbutler.com>",
        to: [params.to],
        subject: "Your free Influencer Butler Pro license",
        text: lines.join("\n"),
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("comp-issue: Resend send failed", { status: res.status, body: text.slice(0, 500) });
    }
  } catch (error) {
    console.error("comp-issue: Resend send threw", error);
  }
}

export async function issueInHouseComp(input: IssueCompInput): Promise<IssueCompResult> {
  // No recipient email -> an unassigned comp: mint under a placeholder identity
  // so the entitlement (which needs a user_id) still works, skip delivery, and
  // let the admin copy the key and hand it out. hasRecipient gates the email +
  // sign-in link and how the grant/list present it.
  const rawEmail = (input.email ?? "").trim();
  const hasRecipient = rawEmail.length > 0;
  const email = hasRecipient ? rawEmail : `comp-${randomUUID()}@${COMP_PLACEHOLDER_DOMAIN}`;
  const forever = input.forever === true;
  const months = forever ? null : input.months;
  const isDailyDeals = input.plan === ADDON_PLAN_DAILY_DEALS;
  const tier = tierForPlan(input.plan);
  if (!tier && !isDailyDeals) return { ok: false, status: 400, error: "Unsupported plan." };
  if (!forever && (typeof months !== "number" || !Number.isInteger(months) || months < 1)) {
    return { ok: false, status: 400, error: "Free months must be a whole number, or mark the comp as forever." };
  }

  // The LS variant id for this plan, stored on the synthetic subscription so
  // the licensing worker's in-house validation returns the right tier / add-on.
  const variant = resolveVariantId(input.plan, undefined);
  if (!variant.ok) {
    console.error("comp-issue: variant resolve failed", { plan: input.plan, variant });
    return { ok: false, status: 500, error: "Server misconfiguration" };
  }
  const planName = isDailyDeals ? "Daily Deals Workspace (comp)" : `${TIER_NAME[tier!]} (comp)`;
  // Seat limit written to the key: the admin's chosen count when valid, else the
  // plan's default (Solo 1 / Team 10 / Agency 25, Daily Deals add-on 1).
  const planDefaultSeats = isDailyDeals ? 1 : SEAT_LIMIT[tier!];
  const activationLimit =
    typeof input.seats === "number" && Number.isInteger(input.seats) && input.seats >= 1
      ? input.seats
      : planDefaultSeats;

  const svc = adminService();
  if (!svc) return { ok: false, status: 503, error: "Server misconfigured" };

  const userId = await ensureCompUser(svc, email, input.name);
  if (!userId) return { ok: false, status: 502, error: "Could not create the recipient account." };

  // Never stack a second PRIMARY comp on someone who already has live access,
  // unless the admin explicitly overrides (allowExisting). The Daily Deals
  // add-on is meant to sit ON TOP of a plan, so it is always exempt. Unassigned
  // comps get a fresh placeholder user, so this never trips for them.
  if (!isDailyDeals && !input.allowExisting) {
    const liveSub = await svc
      .from("subscriptions")
      .select("id")
      .eq("user_id", userId)
      .in("status", LIVE_STATUSES)
      .limit(1);
    if (!liveSub.error && (liveSub.data?.length ?? 0) > 0) {
      return {
        ok: false,
        status: 409,
        error: "That account already has a live subscription. Cancel it first, or use another email.",
      };
    }
  }

  const nowIso = new Date().toISOString();
  const expiresAt = forever ? null : addMonthsUtc(nowIso, months!);
  const sentinel = `comp:${randomUUID()}`;
  const key = randomUUID().toUpperCase();
  const keyHash = hashLicenseKey(key);

  // 1) Synthetic subscription = the entitlement (Pro tier, or the add-on).
  const subInsert = await svc.from("subscriptions").insert({
    ls_subscription_id: sentinel,
    user_id: userId,
    status: "active",
    plan_name: planName,
    ls_variant_id: variant.variantId,
  });
  if (subInsert.error) {
    console.error("comp-issue: subscriptions insert failed", subInsert.error);
    const detail = (subInsert.error as { message?: string })?.message;
    return {
      ok: false,
      status: 500,
      error: `Could not create the comp subscription${detail ? `: ${detail}` : "."}`,
    };
  }

  const subRow = await svc
    .from("subscriptions")
    .select("id")
    .eq("ls_subscription_id", sentinel)
    .maybeSingle();
  const subscriptionId = typeof subRow.data?.id === "string" ? subRow.data.id : null;

  // 2) License key. If this fails, roll back the subscription so we never leave
  //    a user Pro with no key to activate.
  const keyInsert = await svc.from("license_keys").insert({
    ls_license_key_id: sentinel,
    user_id: userId,
    subscription_id: subscriptionId,
    key,
    key_hash: keyHash,
    status: "active",
    activation_limit: activationLimit,
  });
  if (keyInsert.error) {
    console.error("comp-issue: license_keys insert failed - rolling back subscription", keyInsert.error);
    await svc.from("subscriptions").delete().eq("ls_subscription_id", sentinel);
    const detail = (keyInsert.error as { message?: string })?.message;
    return { ok: false, status: 500, error: `Could not create the license key${detail ? `: ${detail}` : "."}` };
  }

  const keyRow = await svc
    .from("license_keys")
    .select("id")
    .eq("ls_license_key_id", sentinel)
    .maybeSingle();
  const licenseKeyId = typeof keyRow.data?.id === "string" ? keyRow.data.id : null;

  // 3) Track the comp. Non-fatal: the grant already works; this drives the list
  //    and the expiry cron.
  const codeSeg = codeNameSegment(input.name, email);
  const discountCode = forever ? `${codeSeg}FREE${FOREVER_TOKEN}` : `${codeSeg}FREE${months}M`;
  const grantInsert = await svc.from("comp_grants").insert({
    ls_subscription_id: sentinel,
    user_id: userId,
    user_email: hasRecipient ? email : null,
    discount_code: discountCode,
    months,
    months_source: "manual",
    issued_at: nowIso,
    expires_at: expiresAt,
    source: "in_house",
    license_key_id: licenseKeyId,
  });
  if (grantInsert.error) {
    console.error("comp-issue: comp_grants insert failed (grant still active)", grantInsert.error);
  }

  // 4) Deliver the key. Best-effort; the admin UI also shows it. Skipped for
  //    unassigned comps (no real recipient to email or sign in).
  if (hasRecipient) {
    let signInLink: string | null = null;
    try {
      const siteUrl = (
        process.env.SITE_URL ??
        process.env.NEXT_PUBLIC_SITE_URL ??
        "https://www.influencerbutler.com"
      ).replace(/\/$/, "");
      const link = await svc.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${siteUrl}/dashboard` },
      });
      signInLink = link.data?.properties?.action_link ?? null;
    } catch (err) {
      console.error("comp-issue: generateLink threw", err);
    }
    await sendCompEmail({ to: email, key, months, forever, signInLink });
  }

  return { ok: true, key, userId, email: hasRecipient ? email : null, expiresAt, activationLimit };
}
