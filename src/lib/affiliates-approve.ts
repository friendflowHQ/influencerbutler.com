import { createAdminClient } from "@/lib/admin";
import { generateAndCreateAffiliateCode } from "@/lib/affiliate-code-generator";

const BRANDED_CODE_PERCENT_OFF = 15;

type ApproveClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: string) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

type ApplicationRow = {
  user_id: string;
  email: string;
  full_name: string;
  status: string;
};

type ProfileRow = {
  id: string;
  ls_affiliate_id?: string | null;
  affiliate_code?: string | null;
  ls_affiliate_discount_id?: string | null;
};

export type ApproveActor = "admin" | "auto-cron";

export type ApproveResult =
  | {
      ok: true;
      lsAffiliateId: string | null;
      emailSent: boolean;
      brandedCode: string | null;
      brandedShareLink: string | null;
    }
  | { ok: false; status: number; error: string };

async function sendApprovalEmail(params: {
  to: string;
  name: string;
  brandedCode: string | null;
  brandedShareLink: string | null;
  lsSignupUrl: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const firstName = params.name.split(" ")[0] || "there";
  const lines: string[] = [
    `Hi ${firstName},`,
    ``,
    `Great news — you've been approved as an Influencer Butler affiliate. Two things to do:`,
    ``,
  ];

  if (params.brandedCode) {
    lines.push(
      `1) Your 15%-off code for your audience:`,
      `   ${params.brandedCode}`,
      ``,
      `   Share this code anywhere. When customers use it, you get 35% recurring commission for the life of their subscription.`,
      ``,
    );
    if (params.brandedShareLink) {
      lines.push(
        `   Pre-filled share link (code already applied — easiest thing to post):`,
        `   ${params.brandedShareLink}`,
        ``,
      );
    }
  }

  if (params.lsSignupUrl) {
    lines.push(
      `2) One-time setup — activate your tracked referral link:`,
      `   ${params.lsSignupUrl}`,
      ``,
      `   Sign up using THIS email (${params.to}) so we can match your account. Takes 30 seconds. Your tracked link will appear on your dashboard as soon as Lemon Squeezy confirms you.`,
      ``,
    );
  }

  lines.push(
    `Your affiliate dashboard:`,
    `https://www.influencerbutler.com/dashboard/affiliates`,
    ``,
    `Questions? Just reply to this email.`,
    ``,
    `— The Influencer Butler team`,
  );

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Influencer Butler <affiliates@influencerbutler.com>",
        to: [params.to],
        subject: "You're in — your Influencer Butler affiliate account is live",
        text: lines.join("\n"),
      }),
    });
    return res.ok;
  } catch (error) {
    console.error("Approval email send failed", error);
    return false;
  }
}

function buildBrandedShareLink(code: string): string {
  return `https://www.influencerbutler.com/dashboard/subscription?code=${encodeURIComponent(code)}`;
}

/**
 * Shared affiliate approval flow used by both the admin endpoint and the
 * auto-approval cron.
 *
 * Important: we do NOT programmatically create the Lemon Squeezy affiliate
 * record — LS deprecated POST /v1/affiliates. The user finishes their setup
 * by signing up at LS's hosted affiliate portal (link in the approval email).
 * When LS activates them, the `affiliate_activated` webhook handler fills in
 * `profiles.ls_affiliate_id` — see src/app/api/webhooks/lemonsqueezy/route.ts.
 *
 * Idempotent: re-running for the same user doesn't create duplicate branded
 * codes or re-stamp reviewed_at (we skip code generation if profile already
 * has one).
 */
export async function approveAffiliate(params: {
  userId: string;
  actor: ApproveActor;
  adminEmail?: string;
}): Promise<ApproveResult> {
  const { userId, actor, adminEmail } = params;

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) {
    return { ok: false, status: 500, error: "LEMONSQUEEZY_STORE_ID env var is not set" };
  }

  const supabase = createAdminClient() as unknown as ApproveClient | null;
  if (!supabase) {
    return { ok: false, status: 500, error: "Server misconfigured" };
  }

  // 1) Load the application.
  const { data: appData, error: appError } = await supabase
    .from("affiliate_applications")
    .select("user_id,email,full_name,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (appError) {
    console.error("approve: application query failed", appError);
    return { ok: false, status: 500, error: "Could not load application" };
  }

  const application = appData as unknown as ApplicationRow | null;
  if (!application) {
    return { ok: false, status: 404, error: "No application for that user" };
  }

  // 2) Read any existing profile fields so we can skip redundant work.
  const { data: profileData } = await supabase
    .from("profiles")
    .select("id,ls_affiliate_id,affiliate_code,ls_affiliate_discount_id")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileData as unknown as ProfileRow | null;

  const existingLsAffiliateId: string | null =
    typeof profile?.ls_affiliate_id === "string" && profile.ls_affiliate_id.length > 0
      ? profile.ls_affiliate_id
      : null;

  // 2b) Generate a branded 15%-off code for this affiliate (JOHN, JOHN2, ...).
  //     Skip if the profile already has one from a prior approval attempt.
  let brandedCode: string | null =
    typeof profile?.affiliate_code === "string" && profile.affiliate_code.length > 0
      ? profile.affiliate_code
      : null;
  let brandedDiscountId: string | null =
    typeof profile?.ls_affiliate_discount_id === "string" &&
    profile.ls_affiliate_discount_id.length > 0
      ? profile.ls_affiliate_discount_id
      : null;

  if (!brandedCode) {
    const firstName = application.full_name.split(" ")[0] ?? "";
    const generated = await generateAndCreateAffiliateCode({
      firstName,
      storeId,
      percentOff: BRANDED_CODE_PERCENT_OFF,
    });
    if (generated) {
      brandedCode = generated.code;
      brandedDiscountId = generated.discountId;
    } else {
      console.error("approve: branded code generation failed", { userId });
      // Non-fatal — the user can still complete LS portal signup and earn commissions via the tracked link.
    }
  }

  // 3) Upsert the profile. We include email so the INSERT path works when the
  //    user doesn't have a profile row yet (profiles.email is NOT NULL). For
  //    existing rows, email will be overwritten with the application's email —
  //    harmless since it should match what they signed up with.
  //    We don't write ls_affiliate_id so we don't null out any value the
  //    webhook may have set earlier.
  const profilePayload: Record<string, unknown> = {
    id: userId,
    email: application.email,
    is_affiliate: true,
  };
  if (brandedCode) profilePayload.affiliate_code = brandedCode;
  if (brandedDiscountId) profilePayload.ls_affiliate_discount_id = brandedDiscountId;

  const { error: profileUpsertError } = await supabase
    .from("profiles")
    .upsert(profilePayload, { onConflict: "id" });

  if (profileUpsertError) {
    console.error("approve: profile upsert failed", profileUpsertError);
    return { ok: false, status: 500, error: "Could not update profile" };
  }

  // 4) Mark application approved.
  const notes =
    actor === "auto-cron"
      ? "Auto-approved after 10 min delay"
      : `Approved by ${adminEmail ?? "admin"}`;

  const { error: appUpdateError } = await supabase
    .from("affiliate_applications")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      admin_notes: notes,
      auto_approved: actor === "auto-cron",
    })
    .eq("user_id", userId);

  if (appUpdateError) {
    console.error("approve: application update failed", appUpdateError);
    // Not fatal — profile is already set, the affiliate works.
  }

  // 5) Fire-and-forget approval email.
  const brandedShareLink = brandedCode ? buildBrandedShareLink(brandedCode) : null;
  const lsSignupUrl = process.env.NEXT_PUBLIC_LEMONSQUEEZY_AFFILIATE_SIGNUP_URL ?? null;
  const emailSent = await sendApprovalEmail({
    to: application.email,
    name: application.full_name,
    brandedCode,
    brandedShareLink,
    lsSignupUrl,
  });

  return {
    ok: true,
    lsAffiliateId: existingLsAffiliateId,
    emailSent,
    brandedCode,
    brandedShareLink,
  };
}
