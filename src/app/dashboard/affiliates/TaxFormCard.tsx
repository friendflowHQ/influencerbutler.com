"use client";

import { useEffect, useState } from "react";

/**
 * Affiliate tax form (W-9 / W-8BEN / W-8BEN-E). Because the self-hosted program
 * makes us the payer, we collect the form and issue 1099-NECs. The TIN is
 * encrypted server-side; this component only ever shows status + last4.
 */

type TaxForm = {
  form_type: string;
  legal_name: string;
  country: string | null;
  tin_last4: string | null;
  tin_kind: string | null;
  status: "not_submitted" | "submitted" | "verified" | "rejected";
  submitted_at: string | null;
  verified_at: string | null;
  rejected_reason: string | null;
};

type Props = { onChange?: () => void };

export default function TaxFormCard({ onChange }: Props) {
  const [form, setForm] = useState<TaxForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/affiliates/tax-form", { cache: "no-store" });
        const json = (await res.json().catch(() => ({}))) as { form?: TaxForm | null };
        if (!cancelled) setForm(json.form ?? null);
      } catch (err) {
        console.error("tax-form load failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const status = form?.status ?? "not_submitted";

  if (loading) {
    return <div className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />;
  }

  if (!editing && status === "verified") {
    return (
      <Shell>
        <StatusPill tone="green" label="Tax form verified" />
        <p className="mt-2 text-sm text-slate-600">
          Your {form?.form_type} is on file{form?.tin_last4 ? ` (TIN ending ${form.tin_last4})` : ""}.
          You&apos;re all set to receive payouts.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-sm font-medium text-[#f97316] underline underline-offset-2"
        >
          Update my tax form
        </button>
      </Shell>
    );
  }

  if (!editing && status === "submitted") {
    return (
      <Shell>
        <StatusPill tone="amber" label="Tax form under review" />
        <p className="mt-2 text-sm text-slate-600">
          We received your {form?.form_type}. We&apos;ll verify it before your first payout. No action needed.
        </p>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 text-sm font-medium text-[#f97316] underline underline-offset-2"
        >
          Edit my tax form
        </button>
      </Shell>
    );
  }

  if (!editing) {
    // not_submitted or rejected
    return (
      <Shell>
        {status === "rejected" ? (
          <>
            <StatusPill tone="red" label="Tax form needs changes" />
            <p className="mt-2 text-sm text-slate-600">
              {form?.rejected_reason ?? "Please review and resubmit your tax form."}
            </p>
          </>
        ) : (
          <>
            <StatusPill tone="slate" label="Tax form required" />
            <p className="mt-2 text-sm text-slate-600">
              We pay your commissions directly, so we need a W-9 (US) or W-8BEN (non-US) on file
              before your first payout. Takes about two minutes.
            </p>
          </>
        )}
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="mt-3 inline-flex items-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c]"
        >
          {status === "rejected" ? "Fix and resubmit" : "Complete tax form"}
        </button>
      </Shell>
    );
  }

  return (
    <TaxFormEditor
      onDone={(saved) => {
        setForm(saved);
        setEditing(false);
        onChange?.();
      }}
      onCancel={() => setEditing(false)}
    />
  );
}

function TaxFormEditor({
  onDone,
  onCancel,
}: {
  onDone: (form: TaxForm) => void;
  onCancel: () => void;
}) {
  const [isUsPerson, setIsUsPerson] = useState(true);
  const [isEntity, setIsEntity] = useState(false);
  const [legalName, setLegalName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [taxClassification, setTaxClassification] = useState("individual");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("United States");
  const [tinKind, setTinKind] = useState<"ssn" | "ein" | "itin" | "foreign">("ssn");
  const [tin, setTin] = useState("");
  const [treatyCountry, setTreatyCountry] = useState("");
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formType = isUsPerson ? "W-9" : isEntity ? "W-8BEN-E" : "W-8BEN";

  const submit = async () => {
    setError(null);
    if (!legalName.trim()) return setError("Enter your legal name.");
    if (!certified) return setError("You must certify the form to submit it.");
    if (isUsPerson && !tin.trim()) return setError("Enter your SSN or EIN.");
    setSubmitting(true);
    try {
      const res = await fetch("/api/affiliates/tax-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType,
          legalName: legalName.trim(),
          businessName: businessName.trim() || null,
          taxClassification: isUsPerson ? taxClassification : null,
          addressLine1: address1.trim() || null,
          addressLine2: address2.trim() || null,
          city: city.trim() || null,
          region: region.trim() || null,
          postalCode: postalCode.trim() || null,
          country: country.trim() || null,
          tin: tin.trim() || null,
          tinKind: isUsPerson ? tinKind : "foreign",
          treatyCountry: !isUsPerson ? treatyCountry.trim() || null : null,
          signatureName: legalName.trim(),
          certified,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Could not submit. Please try again.");
        setSubmitting(false);
        return;
      }
      onDone({
        form_type: formType,
        legal_name: legalName.trim(),
        country: country.trim() || null,
        tin_last4: tin.trim() ? tin.replace(/\D/g, "").slice(-4) : null,
        tin_kind: isUsPerson ? tinKind : "foreign",
        status: "submitted",
        submitted_at: new Date().toISOString(),
        verified_at: null,
        rejected_reason: null,
      });
    } catch (err) {
      console.error("tax-form submit failed", err);
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <Shell>
      <h3 className="text-lg font-semibold text-slate-900">Your tax form</h3>
      <p className="mt-1 text-sm text-slate-600">
        Required before payouts. Your taxpayer ID is encrypted and only used to issue your 1099.
      </p>

      <div className="mt-4 space-y-4">
        <fieldset className="flex flex-wrap gap-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="usperson"
              checked={isUsPerson}
              onChange={() => setIsUsPerson(true)}
            />
            I&apos;m a US person (W-9)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="usperson"
              checked={!isUsPerson}
              onChange={() => setIsUsPerson(false)}
            />
            I&apos;m not a US person (W-8BEN)
          </label>
        </fieldset>

        {!isUsPerson ? (
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isEntity} onChange={(e) => setIsEntity(e.target.checked)} />
            This is a company / entity (W-8BEN-E)
          </label>
        ) : null}

        <Field label="Legal name">
          <input className={inputCls} value={legalName} onChange={(e) => setLegalName(e.target.value)} />
        </Field>

        <Field label="Business name (if different)">
          <input className={inputCls} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </Field>

        {isUsPerson ? (
          <Field label="Federal tax classification">
            <select
              className={inputCls}
              value={taxClassification}
              onChange={(e) => setTaxClassification(e.target.value)}
            >
              <option value="individual">Individual / sole proprietor</option>
              <option value="llc">LLC</option>
              <option value="c-corp">C corporation</option>
              <option value="s-corp">S corporation</option>
              <option value="partnership">Partnership</option>
              <option value="trust">Trust / estate</option>
            </select>
          </Field>
        ) : null}

        <Field label="Address">
          <input className={inputCls} placeholder="Street address" value={address1} onChange={(e) => setAddress1(e.target.value)} />
          <input className={`${inputCls} mt-2`} placeholder="Apt, suite (optional)" value={address2} onChange={(e) => setAddress2(e.target.value)} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} />
            <input className={inputCls} placeholder="State / region" value={region} onChange={(e) => setRegion(e.target.value)} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input className={inputCls} placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} />
            <input className={inputCls} placeholder="Country" value={country} onChange={(e) => setCountry(e.target.value)} />
          </div>
        </Field>

        {isUsPerson ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Field label="Taxpayer ID type">
              <select className={inputCls} value={tinKind} onChange={(e) => setTinKind(e.target.value as typeof tinKind)}>
                <option value="ssn">SSN</option>
                <option value="ein">EIN</option>
                <option value="itin">ITIN</option>
              </select>
            </Field>
            <Field label="Taxpayer ID number">
              <input className={inputCls} placeholder="XXX-XX-XXXX" value={tin} onChange={(e) => setTin(e.target.value)} autoComplete="off" />
            </Field>
          </div>
        ) : (
          <>
            <Field label="Foreign tax ID (optional)">
              <input className={inputCls} value={tin} onChange={(e) => setTin(e.target.value)} autoComplete="off" />
            </Field>
            <Field label="Country of tax residence (for treaty benefits)">
              <input className={inputCls} value={treatyCountry} onChange={(e) => setTreatyCountry(e.target.value)} />
            </Field>
          </>
        )}

        <label className="flex items-start gap-2 text-xs text-slate-600">
          <input type="checkbox" className="mt-0.5" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
          <span>
            Under penalties of perjury, I certify that the information above is true, correct, and
            complete, and that I am the person (or authorized to sign for the entity) named above.
          </span>
        </label>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center rounded-lg bg-[#f97316] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#ea580c] disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit tax form"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700"
          >
            Cancel
          </button>
        </div>
      </div>
    </Shell>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#f97316] focus:ring-2 focus:ring-[#f97316]/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">{children}</section>
  );
}

function StatusPill({ tone, label }: { tone: "green" | "amber" | "red" | "slate"; label: string }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-800",
    red: "bg-red-100 text-red-800",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${tones[tone]}`}>
      {label}
    </span>
  );
}
