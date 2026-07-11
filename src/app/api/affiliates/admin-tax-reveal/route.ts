import { NextResponse } from "next/server";
import { requirePermission, getAdminSession } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { decryptTin, taxKeyConfigured } from "@/lib/tax-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reveals a single affiliate's full TIN plus their tax-form details, for 1099
 * preparation. Highly sensitive: gated on BOTH the affiliates.tax.view
 * permission AND a super-admin session (ADMIN_EMAILS), and EVERY call is
 * audited. The decrypted value is returned once and never persisted.
 */

export async function GET(request: Request) {
  const actor = await requirePermission("affiliates.tax.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Belt-and-suspenders: reveal is super-admin only, never delegated to an
  // assistant even if the permission were somehow granted.
  const superAdmin = await getAdminSession();
  if (!superAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!taxKeyConfigured()) {
    return NextResponse.json({ error: "Encryption key not configured" }, { status: 503 });
  }

  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ error: "Missing userId" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: form, error: formErr } = await admin
    .from("affiliate_tax_forms")
    .select(
      "form_type,legal_name,business_name,tax_classification,address_line1,address_line2,city,region,postal_code,country,tin_kind,tin_last4,treaty_country,treaty_rate,status",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (formErr) {
    console.error("admin-tax-reveal: form query failed", formErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
  if (!form) {
    return NextResponse.json({ error: "No tax form on file" }, { status: 404 });
  }

  const { data: tinRow, error: tinErr } = await admin
    .from("affiliate_tax_tins")
    .select("tin_ciphertext,tin_iv,tin_tag")
    .eq("user_id", userId)
    .maybeSingle();

  if (tinErr) {
    console.error("admin-tax-reveal: tin query failed", tinErr);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  let tin: string | null = null;
  if (tinRow) {
    try {
      tin = decryptTin({
        ciphertext: tinRow.tin_ciphertext as string,
        iv: tinRow.tin_iv as string,
        tag: tinRow.tin_tag as string,
      });
    } catch (err) {
      console.error("admin-tax-reveal: decrypt failed", err);
      return NextResponse.json({ error: "Could not decrypt TIN" }, { status: 500 });
    }
  }

  // Audit the reveal itself - this is the accountability record for touching a SSN.
  await logAdminAction({
    actor,
    action: "affiliate.tax.reveal",
    targetType: "user",
    targetId: userId,
    details: { formType: form.form_type },
  });

  return NextResponse.json({ form, tin });
}
