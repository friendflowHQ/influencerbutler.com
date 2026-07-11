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
import { addMonthsUtc } from "@/lib/comp-codes";
import { SEAT_LIMIT, TIER_NAME, tierForPlan } from "@/lib/pricing-constants";

export type IssueCompInput = {
  email: string;
  name?: string | null;
  months: number;
  plan: string;
};

export type IssueCompResult =
  | { ok: true; key: string; userId: string; email: string; expiresAt: string }
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
  months: number;
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

  const lines = [
    `Great news: you have been given ${params.months} month${params.months === 1 ? "" : "s"} of Influencer Butler Pro, free.`,
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
  const email = input.email.trim();
  const months = input.months;
  const tier = tierForPlan(input.plan);
  if (!tier) return { ok: false, status: 400, error: "Unsupported plan." };

  const svc = adminService();
  if (!svc) return { ok: false, status: 503, error: "Server misconfigured" };

  const userId = await ensureCompUser(svc, email, input.name);
  if (!userId) return { ok: false, status: 502, error: "Could not create the recipient account." };

  // Never stack a comp on someone who already has live access.
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

  const nowIso = new Date().toISOString();
  const expiresAt = addMonthsUtc(nowIso, months);
  const sentinel = `comp:${randomUUID()}`;
  const key = randomUUID().toUpperCase();
  const keyHash = hashLicenseKey(key);

  // 1) Synthetic subscription = Pro.
  const subInsert = await svc.from("subscriptions").insert({
    ls_subscription_id: sentinel,
    user_id: userId,
    status: "active",
    plan_name: `${TIER_NAME[tier]} (comp)`,
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
    activation_limit: SEAT_LIMIT[tier],
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
  const discountCode = `${codeNameSegment(input.name, email)}FREE${months}M`;
  const grantInsert = await svc.from("comp_grants").insert({
    ls_subscription_id: sentinel,
    user_id: userId,
    user_email: email,
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

  // 4) Deliver the key. Best-effort; the admin UI also shows it.
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
  await sendCompEmail({ to: email, key, months, signInLink });

  return { ok: true, key, userId, email, expiresAt };
}
