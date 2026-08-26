import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encryptTin, tinLastFour, taxKeyConfigured } from "@/lib/tax-crypto";
import { certificationTextFor, type TaxFormType } from "@/lib/tax-certification";
import { sendTaxFormSubmittedAlert } from "@/lib/tax-review-reminder-email";
import { logDbError } from "@/lib/log-db-error";

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
  certificationText?: string;
  certified?: boolean;
};

function s(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

// First entry of a possibly comma-joined forwarded-for chain (client IP).
function firstValue(raw: string | null): string | null {
  if (!raw) return null;
  const first = raw.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
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
      logDbError("tax-form GET: query failed", error);
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

    // Foreign filers (W-8BEN / W-8BEN-E) MUST sign: the IRS requires an
    // affirmative signature, and a bare typed name is not a valid e-signature,
    // so we require the typed signature to match the legal name. US W-9 filers
    // for nonemployee comp are not strictly required to sign, so signature_name
    // stays optional there and defaults to the legal name.
    const isForeignForm = formType === "W-8BEN" || formType === "W-8BEN-E";
    const signatureName = s(body.signatureName);
    if (isForeignForm) {
      if (!signatureName) {
        return NextResponse.json(
          { error: "Type your full legal name to sign this form" },
          { status: 400 },
        );
      }
      if (signatureName.toLowerCase() !== legalName.toLowerCase()) {
        return NextResponse.json(
          { error: "Your signature must match your legal name exactly" },
          { status: 400 },
        );
      }
    }
    // A mailing address is required on both the W-9 (it goes on the 1099-NEC we
    // file) and the W-8BEN (permanent residence address). US filers also need
    // state + ZIP; some countries have no region/postal, so W-8 leaves those
    // optional.
    if (!s(body.addressLine1)) {
      return NextResponse.json({ error: "Street address is required" }, { status: 400 });
    }
    if (!s(body.city)) {
      return NextResponse.json({ error: "City is required" }, { status: 400 });
    }
    if (!s(body.country)) {
      return NextResponse.json({ error: "Country is required" }, { status: 400 });
    }
    if (formType === "W-9" && (!s(body.region) || !s(body.postalCode))) {
      return NextResponse.json({ error: "State and ZIP code are required" }, { status: 400 });
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

    // The signature we record: for W-8 it is the validated typed name; for W-9
    // it defaults to the legal name when the affiliate did not type one.
    const effectiveSignatureName = signatureName ?? legalName;
    const signatureDate = s(body.signatureDate) ?? nowIso.slice(0, 10);
    const tinLast4 = rawTin ? tinLastFour(rawTin) : null;
    // The exact wording the affiliate agreed to (server-derived, never trusted
    // from the client) so the shown and recorded certification text always match.
    const certificationText = certificationTextFor(formType as TaxFormType);
    const clientIp =
      firstValue(request.headers.get("x-forwarded-for")) ??
      firstValue(request.headers.get("x-real-ip"));
    const userAgent = request.headers.get("user-agent");

    // For the admin alert below: whether this replaces an earlier submission.
    const { data: prevForm } = await admin
      .from("affiliate_tax_forms")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

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
        logDbError("tax-form POST: tin upsert failed", tinErr);
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
        tin_last4: tinLast4,
        tin_kind: tinKind,
        treaty_country: s(body.treatyCountry),
        treaty_rate:
          typeof body.treatyRate === "number" && Number.isFinite(body.treatyRate)
            ? body.treatyRate
            : null,
        signature_name: effectiveSignatureName,
        signature_date: signatureDate,
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
      logDbError("tax-form POST: form upsert failed", formErr);
      return NextResponse.json({ error: "Could not save tax form" }, { status: 500 });
    }

    // Append an immutable audit record of this certification (best-effort: the
    // affiliate's form already saved, so a failed audit insert is logged but
    // must not fail the request).
    const { error: eventErr } = await admin.from("affiliate_tax_form_events").insert({
      user_id: user.id,
      form_type: formType,
      legal_name: legalName,
      signature_name: effectiveSignatureName,
      signature_date: signatureDate,
      certified: true,
      tin_last4: tinLast4,
      tin_kind: tinKind,
      certification_text: certificationText,
      ip: clientIp,
      user_agent: userAgent,
      submitted_at: nowIso,
    });
    if (eventErr) {
      logDbError("tax-form POST: audit event insert failed", eventErr);
    }

    // Alert the admin so the form gets reviewed promptly (payouts are blocked on
    // verification). Best-effort: an email failure must not fail the submission.
    try {
      await sendTaxFormSubmittedAlert({
        userId: user.id,
        name: legalName,
        email: user.email ?? null,
        formType,
        country: s(body.country),
        tinLast4,
        tinKind,
        submittedAt: nowIso,
        isResubmit: Boolean(prevForm),
      });
    } catch (alertErr) {
      console.error("tax-form POST: admin alert failed", alertErr);
    }

    return NextResponse.json({ ok: true, status: "submitted" });
  } catch (err) {
    console.error("tax-form POST error", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
