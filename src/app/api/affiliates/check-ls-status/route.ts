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
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const user = userData.user;
    const email = (user.email ?? "").toLowerCase();
    if (!email) {
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

    const query = `/affiliates?filter[user_email]=${encodeURIComponent(email)}&filter[store_id]=${encodeURIComponent(storeId)}`;
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
        { email, count: activeMatches.length },
      );
    }

    const match = activeMatches[0];
    const lsAffiliateId = match?.id;
    if (!lsAffiliateId) {
      console.error("check-ls-status: LS match missing id", { email, match });
      return NextResponse.json({ found: false });
    }

    const adminClient = createAdminClient();
    if (!adminClient) {
      return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
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
