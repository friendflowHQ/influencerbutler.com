import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CheckBody = {
  userId?: string;
};

type CheckClient = {
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

type LsAffiliateListItem = {
  id?: string;
  attributes?: {
    status?: string;
    user_email?: string | null;
  };
};

type LsAffiliateListResponse = {
  data?: LsAffiliateListItem[];
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Admin-triggered, on-demand re-check of one affiliate's Lemon Squeezy link.
 *
 * The normal path is event-driven: LS fires `affiliate_activated` when the
 * user finishes portal signup and the webhook writes profiles.ls_affiliate_id.
 * If the webhook was dropped (or the user never clicked "check status" on
 * their own dashboard), the roster shows "Not linked" forever even though the
 * LS affiliate exists. This route lets an admin poll LS live for a single
 * user and write the link on the spot.
 *
 * Lookup: queries the LS affiliates list by the user's profile email, falling
 * back to their application email if it differs. Only an `active` LS
 * affiliate is linked. Same claim guard as admin-link: refuses to attach an
 * LS affiliate already owned by a different profile.
 */
export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.link", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: CheckBody;
  try {
    body = (await request.json()) as CheckBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) {
    console.error("admin-check-ls: LEMONSQUEEZY_STORE_ID missing");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const supabase = createAdminClient() as unknown as CheckClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("email,ls_affiliate_id,ls_activated_at")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    console.error("admin-check-ls: profile lookup failed", profileErr);
    return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
  }

  const existingLsId = str(profile?.ls_affiliate_id);
  if (existingLsId) {
    return NextResponse.json({
      found: true,
      alreadyLinked: true,
      lsAffiliateId: existingLsId,
    });
  }

  // Candidate emails: profile email first, application email as fallback for
  // the signed-up-with-a-different-address case.
  const { data: application } = await supabase
    .from("affiliate_applications")
    .select("email")
    .eq("user_id", userId)
    .maybeSingle();

  const candidates = Array.from(
    new Set(
      [str(profile?.email), str(application?.email)]
        .filter((e): e is string => e !== null)
        .map((e) => e.toLowerCase()),
    ),
  );

  if (candidates.length === 0) {
    return NextResponse.json({ error: "No email on file for that user" }, { status: 400 });
  }

  let match: { lsAffiliateId: string; lsStatus: string; email: string } | null = null;
  for (const email of candidates) {
    const query = `/affiliates?filter[user_email]=${encodeURIComponent(email)}&filter[store_id]=${encodeURIComponent(storeId)}`;
    const lsResponse = await lsApi(query);
    if (!lsResponse.ok) {
      console.error("admin-check-ls: LS lookup failed", lsResponse.status);
      return NextResponse.json(
        { error: "Could not reach Lemon Squeezy. Please try again in a minute." },
        { status: 502 },
      );
    }

    const payload = (await lsResponse.json()) as LsAffiliateListResponse;
    const items = Array.isArray(payload.data) ? payload.data : [];
    const active = items.find(
      (item) => (item.attributes?.status ?? "").toLowerCase() === "active" && str(item.id),
    );
    if (active?.id) {
      match = {
        lsAffiliateId: active.id,
        lsStatus: (active.attributes?.status ?? "active").toLowerCase(),
        email,
      };
      break;
    }
  }

  if (!match) {
    return NextResponse.json({ found: false, checkedEmails: candidates });
  }

  // Refuse to attach an LS affiliate that already belongs to someone else.
  const { data: claimed, error: claimErr } = await supabase
    .from("profiles")
    .select("id")
    .eq("ls_affiliate_id", match.lsAffiliateId)
    .maybeSingle();

  if (claimErr) {
    console.error("admin-check-ls: claim check failed", claimErr);
    return NextResponse.json({ error: "Could not verify claim" }, { status: 500 });
  }

  const claimedBy = str(claimed?.id);
  if (claimedBy && claimedBy !== userId) {
    return NextResponse.json(
      {
        error: `That Lemon Squeezy affiliate is already linked to another account (${claimedBy.slice(0, 8)}...).`,
      },
      { status: 409 },
    );
  }

  // Stamp an activation date the first time we link (LS has no activation
  // timestamp of its own). Never move an existing date.
  const stampActivation = !profile?.ls_activated_at;

  const { error: upsertErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      is_affiliate: true,
      ls_affiliate_id: match.lsAffiliateId,
      ...(stampActivation ? { ls_activated_at: new Date().toISOString() } : {}),
    },
    { onConflict: "id" },
  );

  if (upsertErr) {
    console.error("admin-check-ls: profile upsert failed", upsertErr);
    return NextResponse.json({ error: "Could not save link" }, { status: 500 });
  }

  console.info("admin-check-ls: linked affiliate", {
    actor: actor.email,
    userId,
    lsAffiliateId: match.lsAffiliateId,
    matchedEmail: match.email,
  });

  await logAdminAction({
    actor,
    action: "affiliate.link",
    targetType: "user",
    targetId: userId,
    details: {
      lsAffiliateId: match.lsAffiliateId,
      lsStatus: match.lsStatus,
      matchedEmail: match.email,
      via: "admin-check-ls",
    },
  });

  return NextResponse.json({
    found: true,
    lsAffiliateId: match.lsAffiliateId,
    lsStatus: match.lsStatus,
    matchedEmail: match.email,
  });
}
