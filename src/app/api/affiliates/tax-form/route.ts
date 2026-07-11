import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptTin, tinLastFour, taxKeyConfigured } from "@/lib/tax-crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Affiliate self-service tax form (W-9 / W-8BEN / W-8BEN-E).
 *
 * GET  - returns the caller's own non-sensitive form status (never the TIN).
 * POST - submits/updates the form. The raw TIN is encrypted (AES-256-GCM) into
 *        the service-role-only affiliate_tax_tins table; only tin_last4 is kept
 *        on the readable row. Status is forced to 'submitted' here - affiliates
 *        can never set 'verified' (that is an admin action), which is why all
 *        writes go through the service-role client rather than affiliate RLS.
 */

const FORM_TYPES = new Set(["W-9", "W-8BEN", "W-8BEN-E"]);
const TIN_KINDS = new Set(["ssn", "ein", "itin", "foreign"]);

type TaxBody = {
  formType?: string;
  legalName?: string;
  businessName?: string | null;
  taxClassification?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  country?: string | null;
  tin?: string | null;
  tinKind?: string | null;
  treatyCountry?: string | null;
  treatyRate?: number | null;
  signatureName?: string;
  signatureDate?: string;
  certified?: boolean;
};

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("affiliate_tax_forms")
      .select(
        "form_type,legal_name,country,tin_last4,tin_kind,status,submitted_at,verified_at,rejected_reason",
      )
      .eq("user_id", userData.user.id)
      .maybeSingle();

    if (error) {
      console.error("tax-form GET: query failed", error);
      return NextResponse.json({ error: "Could not load tax form" }, { status: 500 });
    }

    return NextResponse.json({ form: data ?? null });
  } catch (err) {
    console.error("tax-form GET error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    if (!taxKeyConfigured()) {
      console.error("tax-form POST: TAX_FORM_ENCRYPTION_KEY not configured");
      return NextResponse.json(
        { error: "Tax form submission is temporarily unavailable. Please try again later." },
        { status: 503 },
      );
    }

    const supabase = await createClient();
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const user = userData.user;

    const admin = createAdminClient();

    // Only approved affiliates can submit a tax form.
    const { data: profile } = await admin
      .from("profiles")
      .select("is_affiliate")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile || profile.is_affiliate !== true) {
      return NextResponse.json({ error: "Not an affiliate" }, { status: 403 });
    }

    let body: TaxBody;
    try {
      body = (await request.json()) as TaxBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const formType = s(body.formType);
    if (!formType || !FORM_TYPES.has(formType)) {
      return NextResponse.json({ error: "Select a valid tax form type" }, { status: 400 });
    }
    const legalName = s(body.legalName);
    if (!legalName) {
      return NextResponse.json({ error: "Legal name is required" }, { status: 400 });
    }
    if (body.certified !== true) {
      return NextResponse.json(
        { error: "You must certify the form under penalties of perjury" },
        { status: 400 },
      );
    }
    const tinKind = s(body.tinKind);
    if (!tinKind || !TIN_KINDS.has(tinKind)) {
      return NextResponse.json({ error: "Select a valid taxpayer ID type" }, { status: 400 });
    }
    const rawTin = s(body.tin);
    // US forms (SSN/EIN/ITIN) require a TIN; foreign W-8 filers may not have one.
    if (tinKind !== "foreign" && !rawTin) {
      return NextResponse.json({ error: "Taxpayer identification number is required" }, { status: 400 });
    }

    const nowIso = new Date().toISOString();

    // Encrypt + store the TIN in the service-role-only table (upsert on user_id).
    if (rawTin) {
      const enc = encryptTin(rawTin);
      const { error: tinErr } = await admin.from("affiliate_tax_tins").upsert(
        {
          user_id: user.id,
          tin_ciphertext: enc.ciphertext,
          tin_iv: enc.iv,
          tin_tag: enc.tag,
          updated_at: nowIso,
        },
        { onConflict: "user_id" },
      );
      if (tinErr) {
        console.error("tax-form POST: tin upsert failed", tinErr);
        return NextResponse.json({ error: "Could not save tax form" }, { status: 500 });
      }
    }

    const { error: formErr } = await admin.from("affiliate_tax_forms").upsert(
      {
        user_id: user.id,
        form_type: formType,
        legal_name: legalName,
        business_name: s(body.businessName),
        tax_classification: s(body.taxClassification),
        address_line1: s(body.addressLine1),
        address_line2: s(body.addressLine2),
        city: s(body.city),
        region: s(body.region),
        postal_code: s(body.postalCode),
        country: s(body.country),
        tin_last4: rawTin ? tinLastFour(rawTin) : null,
        tin_kind: tinKind,
        treaty_country: s(body.treatyCountry),
        treaty_rate:
          typeof body.treatyRate === "number" && Number.isFinite(body.treatyRate)
            ? body.treatyRate
            : null,
        signature_name: s(body.signatureName) ?? legalName,
        signature_date: s(body.signatureDate) ?? nowIso.slice(0, 10),
        certified: true,
        // Re-submitting always drops back to 'submitted' for admin re-review.
        status: "submitted",
        submitted_at: nowIso,
        verified_at: null,
        verified_by: null,
        rejected_reason: null,
        updated_at: nowIso,
      },
      { onConflict: "user_id" },
    );

    if (formErr) {
      console.error("tax-form POST: form upsert failed", formErr);
      return NextResponse.json({ error: "Could not save tax form" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: "submitted" });
  } catch (err) {
    console.error("tax-form POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
