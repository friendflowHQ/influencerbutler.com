import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { generateAndCreateAffiliateCode } from "@/lib/affiliate-code-generator";
import { createBrandedDiscount, deleteDiscount } from "@/lib/lemonsqueezy-discounts";
import { getDiscountableVariantIds } from "@/lib/lemonsqueezy";
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
 *
 * Also accepts an optional `customCode` for affiliates who want a specific
 * string (e.g. their brand name instead of their first name). That path mints
 * the exact code - no numbered fallback - and 409s if it is taken locally or
 * in Lemon Squeezy. Either path best-effort deletes the replaced discount so
 * the old code cannot keep being redeemed without attribution behind it.
 */

type RegenBody = { userId?: string; customCode?: string };

// LS discount codes may only contain uppercase letters and numbers; hyphens or
// spaces get the whole request rejected with a 422.
const CUSTOM_CODE_PATTERN = /^[A-Z0-9]{2,32}$/;

type RegenClient = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (
        col: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{ data: Record<string, unknown> | null; error: unknown }>;
        neq: (
          col: string,
          value: string,
        ) => {
          limit: (n: number) => Promise<{ data: Record<string, unknown>[] | null; error: unknown }>;
        };
      };
    };
    update: (payload: Record<string, unknown>) => {
      eq: (col: string, value: string) => Promise<{ error: unknown }>;
    };
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
    .select("id,is_affiliate,affiliate_code,ls_affiliate_discount_id")
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
  const previousDiscountId =
    typeof profile.ls_affiliate_discount_id === "string" ? profile.ls_affiliate_discount_id : "";
  const firstName = (fullName.split(" ")[0] || existingCode || "AFF").trim();

  const customCode = body.customCode?.trim().toUpperCase() ?? "";

  let generated: { code: string; discountId: string } | null = null;

  if (customCode) {
    if (!CUSTOM_CODE_PATTERN.test(customCode)) {
      return NextResponse.json(
        { error: "Codes must be 2-32 letters and numbers only (Lemon Squeezy rejects hyphens and spaces)." },
        { status: 400 },
      );
    }
    if (customCode === existingCode) {
      return NextResponse.json(
        { error: `${customCode} is already their current code.` },
        { status: 400 },
      );
    }

    const { data: taken, error: takenErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("affiliate_code", customCode)
      .neq("id", userId)
      .limit(1);
    if (takenErr) {
      console.error("admin-regenerate-code: collision query failed", takenErr);
      return NextResponse.json({ error: "Query failed" }, { status: 500 });
    }
    if (Array.isArray(taken) && taken.length > 0) {
      return NextResponse.json(
        { error: `Another affiliate already uses ${customCode}.` },
        { status: 409 },
      );
    }

    const created = await createBrandedDiscount({
      storeId,
      code: customCode,
      percentOff: BRANDED_CODE_PERCENT_OFF,
      variantIds: getDiscountableVariantIds(),
    });
    if (!created.ok) {
      return created.conflict
        ? NextResponse.json(
            { error: `${customCode} already exists as a discount in Lemon Squeezy. Delete it there first or pick another code.` },
            { status: 409 },
          )
        : NextResponse.json(
            { error: "Could not create a discount in Lemon Squeezy (check LS API key + store)." },
            { status: 502 },
          );
    }
    generated = { code: customCode, discountId: created.discountId };
  } else {
    generated = await generateAndCreateAffiliateCode({
      firstName,
      storeId,
      percentOff: BRANDED_CODE_PERCENT_OFF,
    });
  }

  if (!generated) {
    return NextResponse.json(
      { error: "Could not create a discount in Lemon Squeezy (check LS API key + store)." },
      { status: 502 },
    );
  }

  // UPDATE, not upsert: profiles.email is NOT NULL and Postgres checks NOT
  // NULL on the proposed insert row BEFORE on-conflict resolution, so a
  // partial-payload upsert always 23502s. The row is guaranteed to exist -
  // we selected it above.
  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      affiliate_code: generated.code,
      ls_affiliate_discount_id: generated.discountId,
    })
    .eq("id", userId);

  if (updateErr) {
    console.error("admin-regenerate-code: profile update failed", updateErr);
    return NextResponse.json({ error: "Created discount but could not save it" }, { status: 500 });
  }

  // Retire the replaced discount so the old code can't keep being redeemed
  // with no affiliate attribution behind it. Best-effort: the swap already
  // succeeded, and in the "Fix codes" case the old discount is usually gone
  // from LS anyway (a 404 counts as success).
  if (previousDiscountId && previousDiscountId !== generated.discountId) {
    const deleted = await deleteDiscount(previousDiscountId);
    if (!deleted.ok) {
      console.error("admin-regenerate-code: could not delete replaced discount", {
        userId,
        previousDiscountId,
      });
    }
  }

  await logAdminAction({
    actor,
    action: "affiliate.code.regenerate",
    targetType: "user",
    targetId: userId,
    details: {
      previousCode: existingCode || null,
      newCode: generated.code,
      custom: Boolean(customCode),
    },
  });

  return NextResponse.json({ ok: true, code: generated.code, discountId: generated.discountId });
}
