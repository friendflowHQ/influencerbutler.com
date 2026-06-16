import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/admin";
import { lsApi } from "@/lib/lemonsqueezy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LsAffiliateListItem = {
  id?: string;
  attributes?: {
    status?: string;
    store_id?: number | string;
    user_email?: string | null;
  };
};

type LsAffiliateListResponse = {
  data?: LsAffiliateListItem[];
};

/**
 * Webhook-fallback poll for the `affiliate_activated` event. If LS drops or
 * delays the webhook, the user is otherwise stuck on the "Complete signup on
 * Lemon Squeezy" screen forever even though they're a fully-approved LS
 * affiliate. This route looks them up via the LS read API and writes the
 * `ls_affiliate_id` ourselves so the dashboard unlocks on next refresh.
 *
 * Only callable by approved IB users in the `ls-signup` state (is_affiliate
 * true, ls_affiliate_id null). Idempotent: if the link already exists, returns
 * the current state without re-querying LS.
 *
 * Self-serve mismatch recovery: the caller may pass an optional `lsEmail` in
 * the body when the email they used on Lemon Squeezy differs from their
 * dashboard email. We then look the affiliate up by that email instead. To
 * stop one user from grabbing another's affiliate, we refuse to link any LS
 * affiliate that is already claimed by a different profile, and log every
 * override-email link for admin visibility.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = userData.user;
    const authEmail = (user.email ?? "").toLowerCase();

    // Optional override: the email the user actually used on Lemon Squeezy.
    let overrideEmail: string | null = null;
    try {
      const body = (await request.json().catch(() => ({}))) as { lsEmail?: unknown };
      if (typeof body.lsEmail === "string") {
        const trimmed = body.lsEmail.trim().toLowerCase();
        if (trimmed.length > 0) {
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed)) {
            return NextResponse.json(
              { error: "That doesn't look like a valid email." },
              { status: 400 },
            );
          }
          overrideEmail = trimmed;
        }
      }
    } catch {
      // No body / unparseable body - fall back to the auth email.
    }

    const lookupEmail = overrideEmail ?? authEmail;
    if (!lookupEmail) {
      return NextResponse.json({ error: "Account has no email" }, { status: 400 });
    }

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("is_affiliate,ls_affiliate_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) {
      console.error("check-ls-status: profile lookup failed", profileErr);
      return NextResponse.json({ error: "Could not load profile" }, { status: 500 });
    }

    if (profile?.ls_affiliate_id) {
      return NextResponse.json({
        found: true,
        lsAffiliateId: profile.ls_affiliate_id,
        alreadyLinked: true,
      });
    }

    if (profile?.is_affiliate !== true) {
      return NextResponse.json(
        { error: "Not approved as an affiliate yet" },
        { status: 403 },
      );
    }

    const storeId = process.env.LEMONSQUEEZY_STORE_ID;
    if (!storeId) {
      console.error("check-ls-status: LEMONSQUEEZY_STORE_ID missing");
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    const query = `/affiliates?filter[user_email]=${encodeURIComponent(lookupEmail)}&filter[store_id]=${encodeURIComponent(storeId)}`;
    const lsResponse = await lsApi(query);
    if (!lsResponse.ok) {
      console.error("check-ls-status: LS lookup failed", lsResponse.status);
      return NextResponse.json(
        { error: "Could not reach Lemon Squeezy. Please try again in a minute." },
        { status: 502 },
      );
    }

    const payload = (await lsResponse.json()) as LsAffiliateListResponse;
    const matches = Array.isArray(payload.data) ? payload.data : [];

    const activeMatches = matches.filter(
      (item) => (item.attributes?.status ?? "").toLowerCase() === "active",
    );

    if (activeMatches.length === 0) {
      return NextResponse.json({ found: false });
    }

    if (activeMatches.length > 1) {
      console.warn(
        "check-ls-status: >1 active LS affiliate for one email/store, picking first",
        { email: lookupEmail, count: activeMatches.length },
      );
    }

    const match = activeMatches[0];
    const lsAffiliateId = match?.id;
    if (!lsAffiliateId) {
      console.error("check-ls-status: LS match missing id", { email: lookupEmail, match });
      return NextResponse.json({ found: false });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
    }

    // Don't let one user claim an LS affiliate that already belongs to another
    // account. Critical when an override email is supplied (the user could type
    // someone else's LS email).
    const { data: claimed, error: claimErr } = await adminClient
      .from("profiles")
      .select("id")
      .eq("ls_affiliate_id", lsAffiliateId)
      .maybeSingle();

    if (claimErr) {
      console.error("check-ls-status: claim check failed", claimErr);
      return NextResponse.json({ error: "Could not verify status" }, { status: 500 });
    }

    const claimedBy = claimed && typeof claimed.id === "string" ? claimed.id : null;
    if (claimedBy && claimedBy !== user.id) {
      console.warn("check-ls-status: affiliate already claimed by another account", {
        lsAffiliateId,
        claimedBy,
        attemptedBy: user.id,
        lookupEmail,
        usedOverride: overrideEmail !== null,
      });
      return NextResponse.json(
        {
          error:
            "That Lemon Squeezy affiliate is already linked to another account. If this is yours, email hello@influencerbutler.com.",
        },
        { status: 409 },
      );
    }

    if (overrideEmail) {
      console.info("check-ls-status: linking via override email", {
        userId: user.id,
        authEmail,
        overrideEmail,
        lsAffiliateId,
      });
    }

    const { error: upsertErr } = await adminClient.from("profiles").upsert(
      {
        id: user.id,
        is_affiliate: true,
        ls_affiliate_id: lsAffiliateId,
      },
      { onConflict: "id" },
    );

    if (upsertErr) {
      console.error("check-ls-status: profile upsert failed", upsertErr);
      return NextResponse.json({ error: "Could not save status" }, { status: 500 });
    }

    return NextResponse.json({ found: true, lsAffiliateId });
  } catch (err) {
    console.error("api/affiliates/check-ls-status error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
