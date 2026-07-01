import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { fetchLsAffiliate } from "@/lib/affiliates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LinkBody = {
  userId?: string;
  lsAffiliateId?: string;
};

type LinkClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: Record<string, unknown> | null;
          error: unknown;
        }>;
      };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

/**
 * Admin-only manual linker. Attaches a Lemon Squeezy affiliate ID to an
 * Influencer Butler user when the automatic email match failed (the affiliate
 * signed up on LS with a different email than their dashboard account).
 *
 * This is the fix for the silent-failure class: a user can be approved in our
 * dashboard (is_affiliate=true) yet never get linked because their LS email
 * differs, leaving them stuck on the "Complete signup on Lemon Squeezy" screen
 * AND earning $0 (attribution needs a non-null ls_affiliate_id - see
 * src/lib/promo-resolver.ts resolveAttribution).
 *
 * Guards:
 *  - admin-gated
 *  - the LS affiliate must exist in our store
 *  - the LS affiliate must not already be claimed by a different profile
 */
export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.link", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: LinkBody;
  try {
    body = (await request.json()) as LinkBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const lsAffiliateId = body.lsAffiliateId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }
  if (!lsAffiliateId) {
    return NextResponse.json({ error: "Missing lsAffiliateId" }, { status: 400 });
  }

  // Verify the affiliate actually exists in LS before we write it.
  const lsAffiliate = await fetchLsAffiliate(lsAffiliateId);
  if (!lsAffiliate) {
    return NextResponse.json(
      { error: `No Lemon Squeezy affiliate found for ID ${lsAffiliateId}` },
      { status: 404 },
    );
  }

  const supabase = createAdminClient() as unknown as LinkClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Refuse to attach an LS affiliate that already belongs to someone else.
  const { data: existing, error: existingErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("ls_affiliate_id", lsAffiliateId)
    .maybeSingle();

  if (existingErr) {
    console.error("admin-link: claim check failed", existingErr);
    return NextResponse.json({ error: "Could not verify claim" }, { status: 500 });
  }

  const existingId =
    existing && typeof existing.id === "string" ? existing.id : null;
  if (existingId && existingId !== userId) {
    return NextResponse.json(
      {
        error: `That Lemon Squeezy affiliate is already linked to another account (${existingId.slice(0, 8)}...).`,
      },
      { status: 409 },
    );
  }

  // Stamp an activation date the first time we link an already-active LS
  // affiliate (LS has no activation timestamp of its own). Only set it when the
  // profile has none yet, so a re-link never moves the original date.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("ls_activated_at")
    .eq("id", userId)
    .maybeSingle();
  const alreadyStamped = Boolean(profileRow?.ls_activated_at);
  const stampActivation =
    !alreadyStamped && (lsAffiliate.status ?? "").toLowerCase() === "active";

  const { error: upsertErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      is_affiliate: true,
      ls_affiliate_id: lsAffiliateId,
      ...(stampActivation ? { ls_activated_at: new Date().toISOString() } : {}),
    },
    { onConflict: "id" },
  );

  if (upsertErr) {
    console.error("admin-link: profile upsert failed", upsertErr);
    return NextResponse.json({ error: "Could not save link" }, { status: 500 });
  }

  console.info("admin-link: linked affiliate", {
    actor: actor.email,
    userId,
    lsAffiliateId,
    lsStatus: lsAffiliate.status,
    lsEmail: lsAffiliate.userEmail,
  });

  await logAdminAction({
    actor,
    action: "affiliate.link",
    targetType: "user",
    targetId: userId,
    details: { lsAffiliateId, lsStatus: lsAffiliate.status, lsEmail: lsAffiliate.userEmail },
  });

  return NextResponse.json({
    ok: true,
    userId,
    lsAffiliateId,
    lsStatus: lsAffiliate.status,
    lsEmail: lsAffiliate.userEmail,
  });
}
