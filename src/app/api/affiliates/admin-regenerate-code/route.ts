import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { generateAndCreateAffiliateCode } from "@/lib/affiliate-code-generator";
import { BRANDED_CODE_PERCENT_OFF } from "@/lib/affiliates-approve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin tool to (re)create an affiliate's branded discount code in Lemon
 * Squeezy when the original silently failed - branded-code creation at approval
 * is non-fatal, so a failed POST /discounts leaves the affiliate with no
 * working code. The admin-reconcile feed flags these (codeHealth != 'ok'); this
 * fixes them.
 *
 * The generator's local collision check skips the affiliate's own stale code,
 * so a "discount-not-in-ls" case yields a fresh code (e.g. ALEX -> ALEX2); the
 * stale string never had a working LS discount anyway.
 */

type RegenBody = { userId?: string };

type RegenClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
      };
    };
    upsert: (
      payload: Record<string, unknown>,
      options?: { onConflict: string },
    ) => Promise<{ error: unknown }>;
  };
};

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.codes.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  let body: RegenBody;
  try {
    body = (await request.json()) as RegenBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const supabase = createAdminClient() as unknown as RegenClient | null;
  if (!supabase) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Resolve a first name for the code base: prefer the application's full name,
  // fall back to the existing code, then a generic base.
  const { data: app } = await supabase
    .from("affiliate_applications")
    .select("full_name")
    .eq("user_id", userId)
    .maybeSingle();
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id,is_affiliate,affiliate_code")
    .eq("id", userId)
    .maybeSingle();

  if (profileErr) {
    console.error("admin-regenerate-code: profile query failed", profileErr);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  if (!profile || profile.is_affiliate !== true) {
    return NextResponse.json({ error: "Not an approved affiliate" }, { status: 404 });
  }

  const fullName = typeof app?.full_name === "string" ? app.full_name : "";
  const existingCode =
    typeof profile.affiliate_code === "string" ? profile.affiliate_code : "";
  const firstName = (fullName.split(" ")[0] || existingCode || "AFF").trim();

  const generated = await generateAndCreateAffiliateCode({
    firstName,
    storeId,
    percentOff: BRANDED_CODE_PERCENT_OFF,
  });

  if (!generated) {
    return NextResponse.json(
      { error: "Could not create a discount in Lemon Squeezy (check LS API key + store)." },
      { status: 502 },
    );
  }

  const { error: upsertErr } = await supabase.from("profiles").upsert(
    {
      id: userId,
      affiliate_code: generated.code,
      ls_affiliate_discount_id: generated.discountId,
    },
    { onConflict: "id" },
  );

  if (upsertErr) {
    console.error("admin-regenerate-code: profile upsert failed", upsertErr);
    return NextResponse.json({ error: "Created discount but could not save it" }, { status: 500 });
  }

  await logAdminAction({
    actor,
    action: "affiliate.code.regenerate",
    targetType: "user",
    targetId: userId,
    details: { previousCode: existingCode || null, newCode: generated.code },
  });

  return NextResponse.json({ ok: true, code: generated.code, discountId: generated.discountId });
}
