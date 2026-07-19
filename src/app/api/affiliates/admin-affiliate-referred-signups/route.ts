import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadReferredSignups } from "@/lib/referred-signups-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin "view as affiliate" version of the Referred signups funnel. Same
 * payload as GET /api/affiliates/referred-signups, but for an arbitrary
 * affiliate (?userId=), gated behind affiliates.view. Mirrors the pattern of
 * admin-affiliate-clicks. The response is anonymous by construction (event
 * type + timestamp only), so no extra PII gate is needed.
 */
export async function GET(request: Request) {
  try {
    const actor = await requirePermission("affiliates.view", request);
    if (!actor) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const userId = new URL(request.url).searchParams.get("userId")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "Missing userId" }, { status: 400 });
    }

    const admin = createAdminClient();
    const payload = await loadReferredSignups(admin, userId);
    return NextResponse.json(payload);
  } catch (err) {
    console.error("admin-affiliate-referred-signups error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
