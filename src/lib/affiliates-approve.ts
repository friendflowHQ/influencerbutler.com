import { createAdminClient } from "@/lib/admin";
import { lsCreateAffiliate, buildShareLink } from "@/lib/affiliates";
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
      lsAffiliateId: string;
      shareLink: string;
      emailSent: boolean;
      brandedCode: string | null;
      brandedShareLink: string | null;
    }
  | { ok: false; status: number; error: string };

async function sendApprovalEmail(params: {
  to: string;
  name: string;
  shareLink: string;
  brandedCode: string | null;
  brandedShareLink: string | null;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

  const lines: string[] = [
    `Hi ${params.name.split(" ")[0] || "there"},`,
    ``,
    `Great news — you've been approved as an Influencer Butler affiliate.`,
    ``,
    `Your unique referral link:`,
    params.shareLink,
    ``,
    `You'll earn 35% recurring commission on every paid subscription — for the life of each referral.`,
    ``,
  ];

  if (params.brandedCode && params.brandedShareLink) {
    lines.push(
      `Your branded 15%-off code (share this with your audience):`,
      params.brandedCode,
      ``,
      `Pre-filled share link (code + tracking baked in — this is the easiest thing to share):`,
      params.brandedShareLink,
      ``,
      `Important: when someone types your code during checkout here, you're credited automatically — as long as they start from a link on our site (the pre-filled link above is bulletproof).`,
      ``,
    );
  }

  lines.push(
    `See your live stats, copy your link, and track earnings in your dashboard:`,
    `https://www.influencerbutler.com/dashboard/affiliates`,
    ``,
    `Questions? Reply to this email.`,
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
 * auto-approval cron. Idempotent — if the profile already has an
 * ls_affiliate_id we don't create a duplicate Lemon Squeezy affiliate.
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

  // 2) If profile already has an ls_affiliate_id, skip creating a duplicate.
  const { data: profileData } = await supabase
    .from("profiles")
    .select("id,ls_affiliate_id,affiliate_code,ls_affiliate_discount_id")
    .eq("id", userId)
    .maybeSingle();
  const profile = profileData as unknown as ProfileRow | null;

  let lsAffiliateId: string | null =
    typeof profile?.ls_affiliate_id === "string" && profile.ls_affiliate_id.length > 0
      ? profile.ls_affiliate_id
      : null;
  let shareDomain: string | null = null;

  if (!lsAffiliateId) {
    const created = await lsCreateAffiliate({
      email: application.email,
      name: application.full_name,
      storeId,
    });
    if (!created) {
      return {
        ok: false,
        status: 502,
        error: "Lemon Squeezy affiliate creation failed — check server logs",
      };
    }
    lsAffiliateId = created.id;
    shareDomain = created.shareDomain;
  }

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
      // Non-fatal — affiliate still has their tracked URL.
    }
  }

  // 3) Upsert the profile with the new affiliate ID + branded code.
  const profilePayload: Record<string, unknown> = {
    id: userId,
    is_affiliate: true,
    ls_affiliate_id: lsAffiliateId,
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
  const shareLink = buildShareLink(shareDomain, lsAffiliateId);
  const brandedShareLink = brandedCode ? buildBrandedShareLink(brandedCode) : null;
  const emailSent = await sendApprovalEmail({
    to: application.email,
    name: application.full_name,
    shareLink,
    brandedCode,
    brandedShareLink,
  });

  return {
    ok: true,
    lsAffiliateId,
    shareLink,
    emailSent,
    brandedCode,
    brandedShareLink,
  };
}
