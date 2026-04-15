import { NextResponse } from "next/server";
import { getAdminSession, createAdminClient } from "@/lib/admin";
import { lsCreateAffiliate, buildShareLink } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ApproveBody = {
  userId?: string;
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
};

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

async function sendApprovalEmail(params: {
  to: string;
  name: string;
  shareLink: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return false;

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
        text: [
          `Hi ${params.name.split(" ")[0] || "there"},`,
          ``,
          `Great news — you've been approved as an Influencer Butler affiliate.`,
          ``,
          `Your unique referral link:`,
          params.shareLink,
          ``,
          `You'll earn 35% recurring commission on every paid subscription — for the life of each referral.`,
          ``,
          `See your live stats, copy your link, and track earnings in your dashboard:`,
          `https://www.influencerbutler.com/dashboard/affiliates`,
          ``,
          `Questions? Reply to this email.`,
          ``,
          `— The Influencer Butler team`,
        ].join("\n"),
      }),
    });
    return res.ok;
  } catch (error) {
    console.error("Approval email send failed", error);
    return false;
  }
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: ApproveBody;
  try {
    body = (await request.json()) as ApproveBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) {
    return NextResponse.json(
      { error: "LEMONSQUEEZY_STORE_ID env var is not set" },
      { status: 500 },
    );
  }

  const supabase = createAdminClient() as unknown as ApproveClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // 1) Load the application.
  const { data: appData, error: appError } = await supabase
    .from("affiliate_applications")
    .select("user_id,email,full_name,status")
    .eq("user_id", userId)
    .maybeSingle();

  if (appError) {
    console.error("approve: application query failed", appError);
    return NextResponse.json({ error: "Could not load application" }, { status: 500 });
  }

  const application = appData as unknown as ApplicationRow | null;
  if (!application) {
    return NextResponse.json({ error: "No application for that user" }, { status: 404 });
  }

  // 2) If profile already has an ls_affiliate_id, skip creating a duplicate.
  const { data: profileData } = await supabase
    .from("profiles")
    .select("id,ls_affiliate_id")
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
      return NextResponse.json(
        { error: "Lemon Squeezy affiliate creation failed — check server logs" },
        { status: 502 },
      );
    }
    lsAffiliateId = created.id;
    shareDomain = created.shareDomain;
  }

  // 3) Upsert the profile with the new affiliate ID.
  const { error: profileUpsertError } = await supabase
    .from("profiles")
    .upsert(
      { id: userId, is_affiliate: true, ls_affiliate_id: lsAffiliateId },
      { onConflict: "id" },
    );

  if (profileUpsertError) {
    console.error("approve: profile upsert failed", profileUpsertError);
    return NextResponse.json({ error: "Could not update profile" }, { status: 500 });
  }

  // 4) Mark application approved.
  const { error: appUpdateError } = await supabase
    .from("affiliate_applications")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      admin_notes: `Approved by ${admin.email}`,
    })
    .eq("user_id", userId);

  if (appUpdateError) {
    console.error("approve: application update failed", appUpdateError);
    // Not fatal — profile is already set, the affiliate works.
  }

  // 5) Fire-and-forget approval email.
  const shareLink = buildShareLink(shareDomain, lsAffiliateId);
  const emailSent = await sendApprovalEmail({
    to: application.email,
    name: application.full_name,
    shareLink,
  });

  return NextResponse.json({
    ok: true,
    lsAffiliateId,
    shareLink,
    emailSent,
  });
}
