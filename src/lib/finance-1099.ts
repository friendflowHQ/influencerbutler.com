// 1099-NEC filing logic for affiliate payouts, plus a foreign-affiliate
// (W-8BEN) records view. Pure functions + CSV builders are unit-tested; the
// data loader reads affiliate_payouts / affiliate_tax_forms / filings.
//
// Basis: sum affiliate_payouts.gross_cents (status='success') by paid_at year.
// That already nets clawbacks and includes make-whole rows, so it is the
// correct non-double-counting amount (do NOT add adjustments on top).
//
// US vs foreign is decided by FORM TYPE (a verified W-9 is a US person; a
// W-8BEN/W-8BEN-E is foreign); the free-text country is only a fallback for
// payees with no form. Nothing here is tax advice.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { FinanceSettings } from "@/lib/finance-settings";
import { isMigrationPendingError } from "@/lib/finance-stepup";

/**
 * Reportable threshold for a tax year, in cents. $600 through TY2025; the OBBBA
 * raised the 1099-NEC/MISC threshold to $2,000 starting TY2026 (inflation
 * indexed after). Re-verify the indexed amount each filing season.
 */
export function reportableThresholdCentsForYear(year: number): number {
  return year <= 2025 ? 60000 : 200000;
}

/** Broad "is this the United States" check for the no-form fallback only. */
export function isUsCountry(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s.startsWith("united states")) return true;
  return ["us", "usa", "u s", "u s a", "america", "estados unidos"].includes(s);
}

export type PayeeClass = "us" | "foreign" | "unknown";

/** US if W-9, foreign if W-8*, else fall back to the country string. */
export function classifyPayee(
  formType: string | null | undefined,
  country: string | null | undefined,
): PayeeClass {
  if (formType === "W-9") return "us";
  if (formType === "W-8BEN" || formType === "W-8BEN-E") return "foreign";
  if (isUsCountry(country)) return "us";
  return "unknown";
}

export type W8Validity = {
  /** YYYY-MM-DD the form is valid through, or null when no base date. */
  validThrough: string | null;
  expired: boolean | null;
  expiringSoon: boolean | null;
};

/**
 * A W-8BEN is valid through Dec 31 of the third calendar year after the year it
 * was signed (or, failing a signature date, submitted). `today` is YYYY-MM-DD.
 */
export function w8ValidThrough(
  signatureDate: string | null | undefined,
  submittedAt: string | null | undefined,
  today: string,
): W8Validity {
  const base = (signatureDate || submittedAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    return { validThrough: null, expired: null, expiringSoon: null };
  }
  const validThrough = `${Number(base.slice(0, 4)) + 3}-12-31`;
  const expired = today > validThrough;
  const dayMs = 24 * 60 * 60 * 1000;
  const daysLeft = Math.round(
    (new Date(`${validThrough}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
      dayMs,
  );
  return { validThrough, expired, expiringSoon: !expired && daysLeft <= 90 };
}

const CORP_RE = /\b(c[- ]?corp|s[- ]?corp|corporation|incorporated|\binc\b)\b/i;

export type FilingRow = {
  status: "draft" | "exported" | "filed" | "corrected" | "exempt";
  method: string | null;
  amountCents: number | null;
  filedAt: string | null;
  note: string | null;
};

export type Payee1099 = {
  userId: string;
  name: string | null;
  email: string | null;
  legalName: string | null;
  businessName: string | null;
  totalCents: number;
  payoutCount: number;
  country: string | null;
  formType: string | null;
  formStatus: string | null;
  tinLast4: string | null;
  tinKind: string | null;
  reportable: boolean;
  exportEligible: boolean;
  exemptHint: boolean;
  needsCorrection: boolean;
  filing: FilingRow | null;
  // Foreign only.
  treatyCountry: string | null;
  treatyRate: number | null;
  w8: W8Validity | null;
  // Full mailing address (for the forms).
  address1: string | null;
  address2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
};

export type Load1099Result = {
  year: number;
  thresholdCents: number;
  us: Payee1099[];
  foreign: Payee1099[];
  /** Reportable payees with a missing/unverified/rejected/unknown form. */
  attention: Payee1099[];
  filingsMigrationPending: boolean;
};

type PayoutRow = { user_id: string; gross_cents: number | null; paid_at: string | null };
type FormRow = Record<string, unknown>;

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Loads the full 1099 dataset for a tax year. */
export async function load1099Data(
  db: SupabaseClient,
  year: number,
  today: string,
): Promise<Load1099Result | { queryFailed: true }> {
  const startIso = new Date(Date.UTC(year, 0, 1)).toISOString();
  const endIso = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  // 1. Payout totals per user for the calendar year.
  const { data: payouts, error: payoutErr } = await db
    .from("affiliate_payouts")
    .select("user_id,gross_cents,paid_at")
    .eq("status", "success")
    .gte("paid_at", startIso)
    .lt("paid_at", endIso);
  if (payoutErr) {
    console.error("load1099Data: payouts query failed", payoutErr);
    return { queryFailed: true };
  }
  const totalByUser = new Map<string, { cents: number; count: number }>();
  for (const p of (payouts ?? []) as PayoutRow[]) {
    const uid = str(p.user_id);
    if (!uid) continue;
    const prev = totalByUser.get(uid) ?? { cents: 0, count: 0 };
    prev.cents += p.gross_cents ?? 0;
    prev.count += 1;
    totalByUser.set(uid, prev);
  }
  const userIds = Array.from(totalByUser.keys());
  if (userIds.length === 0) {
    return {
      year,
      thresholdCents: reportableThresholdCentsForYear(year),
      us: [],
      foreign: [],
      attention: [],
      filingsMigrationPending: false,
    };
  }

  // 2. Tax forms.
  const { data: forms } = await db
    .from("affiliate_tax_forms")
    .select(
      "user_id,form_type,legal_name,business_name,tax_classification,country,address_line1,address_line2,city,region,postal_code,tin_last4,tin_kind,treaty_country,treaty_rate,signature_date,submitted_at,status",
    )
    .in("user_id", userIds);
  const formByUser = new Map<string, FormRow>();
  for (const f of (forms ?? []) as FormRow[]) {
    const uid = str(f.user_id);
    if (uid) formByUser.set(uid, f);
  }

  // 3. Names + emails (applications, profiles fallback).
  const { data: apps } = await db
    .from("affiliate_applications")
    .select("user_id,full_name,email")
    .in("user_id", userIds);
  const appByUser = new Map<string, { name: string | null; email: string | null }>();
  for (const a of (apps ?? []) as FormRow[]) {
    const uid = str(a.user_id);
    if (uid) appByUser.set(uid, { name: str(a.full_name), email: str(a.email) });
  }
  const { data: profs } = await db.from("profiles").select("id,email").in("id", userIds);
  const profEmail = new Map<string, string | null>();
  for (const p of (profs ?? []) as FormRow[]) {
    const uid = str(p.id);
    if (uid) profEmail.set(uid, str(p.email));
  }

  // 4. Filing rows (this year). Degrade if the table is missing.
  let filingsMigrationPending = false;
  const filingByUser = new Map<string, FilingRow>();
  {
    const { data: filings, error: filingErr } = await db
      .from("affiliate_tax_filings")
      .select("user_id,status,method,amount_cents,filed_at,note")
      .eq("tax_year", year)
      .in("user_id", userIds);
    if (filingErr) {
      if (isMigrationPendingError(filingErr)) filingsMigrationPending = true;
      else console.error("load1099Data: filings query failed", filingErr);
    } else {
      for (const f of (filings ?? []) as FormRow[]) {
        const uid = str(f.user_id);
        if (!uid) continue;
        filingByUser.set(uid, {
          status: (str(f.status) as FilingRow["status"]) ?? "draft",
          method: str(f.method),
          amountCents: typeof f.amount_cents === "number" ? f.amount_cents : null,
          filedAt: str(f.filed_at),
          note: str(f.note),
        });
      }
    }
  }

  const threshold = reportableThresholdCentsForYear(year);
  const us: Payee1099[] = [];
  const foreign: Payee1099[] = [];
  const attention: Payee1099[] = [];

  for (const uid of userIds) {
    const totals = totalByUser.get(uid)!;
    const form = formByUser.get(uid);
    const app = appByUser.get(uid);
    const formType = str(form?.form_type);
    const formStatus = str(form?.status);
    const country = str(form?.country);
    const klass = classifyPayee(formType, country);
    const reportable = totals.cents >= threshold;
    const filing = filingByUser.get(uid) ?? null;
    const verified = formStatus === "verified";
    const isExempt = filing?.status === "exempt";
    const exportEligible = klass === "us" && reportable && verified && !isExempt;
    const needsCorrection =
      (filing?.status === "filed" || filing?.status === "corrected") &&
      filing.amountCents != null &&
      filing.amountCents !== totals.cents;
    const treatyRateRaw = form?.treaty_rate;

    const row: Payee1099 = {
      userId: uid,
      name: app?.name ?? null,
      email: app?.email ?? profEmail.get(uid) ?? null,
      legalName: str(form?.legal_name),
      businessName: str(form?.business_name),
      totalCents: totals.cents,
      payoutCount: totals.count,
      country,
      formType,
      formStatus,
      tinLast4: str(form?.tin_last4),
      tinKind: str(form?.tin_kind),
      reportable,
      exportEligible,
      exemptHint: CORP_RE.test(str(form?.tax_classification) ?? ""),
      needsCorrection: Boolean(needsCorrection),
      filing,
      treatyCountry: str(form?.treaty_country),
      treatyRate: typeof treatyRateRaw === "number" ? treatyRateRaw : null,
      w8:
        klass === "foreign"
          ? w8ValidThrough(str(form?.signature_date), str(form?.submitted_at), today)
          : null,
      address1: str(form?.address_line1),
      address2: str(form?.address_line2),
      city: str(form?.city),
      region: str(form?.region),
      postalCode: str(form?.postal_code),
    };

    if (klass === "foreign") {
      foreign.push(row);
    } else if (klass === "us" && verified) {
      us.push(row);
      if (reportable && needsCorrection) attention.push(row);
    } else {
      // Unknown class, or a US-looking payee whose form is missing/unverified.
      if (reportable) attention.push(row);
      if (klass === "us") us.push(row); // show under US even if unverified
    }
  }

  const byAmount = (a: Payee1099, b: Payee1099) => b.totalCents - a.totalCents;
  us.sort(byAmount);
  foreign.sort(byAmount);
  attention.sort(byAmount);
  return { year, thresholdCents: threshold, us, foreign, attention, filingsMigrationPending };
}

// --- CSV builders ----------------------------------------------------------

export type PayerIdentity = Pick<
  FinanceSettings,
  "payerName" | "payerAddress1" | "payerCity" | "payerRegion" | "payerPostal" | "payerEin" | "payerPhone"
>;

function csvField(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function usd(cents: number): string {
  return (cents / 100).toFixed(2);
}

function tinType(kind: string | null): string {
  return kind === "ein" ? "EIN" : "SSN";
}

function digits(tin: string): string {
  return tin.replace(/\D/g, "");
}

/**
 * Generic provider import (Track1099 / Tax1099). Both accept arbitrary CSVs
 * with an interactive column-mapping step, so header names are not load-bearing.
 * Verify against the provider's current import docs before first use.
 */
export function build1099ProviderCsv(
  rows: Payee1099[],
  payer: PayerIdentity,
  tinByUser: Map<string, string>,
): string {
  const header = [
    "Payer Name",
    "Payer EIN",
    "Payer Address",
    "Payer City",
    "Payer State",
    "Payer Zip",
    "Payer Phone",
    "Recipient TIN Type",
    "Recipient TIN",
    "Recipient Name",
    "Recipient Second Name",
    "Address 1",
    "Address 2",
    "City",
    "State",
    "Zip",
    "Recipient Email",
    "Account Number",
    "Box 1 Nonemployee Compensation",
    "Box 4 Federal Income Tax Withheld",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(payer.payerName),
        csvField(payer.payerEin),
        csvField(payer.payerAddress1),
        csvField(payer.payerCity),
        csvField(payer.payerRegion),
        csvField(payer.payerPostal),
        csvField(payer.payerPhone),
        csvField(tinType(r.tinKind)),
        csvField(digits(tinByUser.get(r.userId) ?? "")),
        csvField(r.legalName ?? r.name),
        csvField(r.businessName),
        csvField(r.address1),
        csvField(r.address2),
        csvField(r.city),
        csvField(r.region),
        csvField(r.postalCode),
        csvField(r.email),
        csvField(r.userId.slice(0, 8)),
        usd(r.totalCents),
        "0.00",
      ].join(","),
    );
  }
  return lines.join("\n");
}

// The IRS IRIS Taxpayer Portal 1099-NEC upload template. Header text and column
// order CHANGE between filing seasons; re-download the current template from the
// portal and diff against this list before each season.
// Verified against the IRIS portal 1099-NEC template documented 2026-08.
export const IRIS_1099NEC_HEADERS = [
  "Recipient TIN Type",
  "Recipient TIN",
  "Recipient Name Line 1",
  "Recipient Name Line 2",
  "Address Line 1",
  "Address Line 2",
  "City",
  "State",
  "ZIP Code",
  "Box 1 Nonemployee Compensation",
  "Box 2 Direct Sales Indicator",
  "Box 4 Federal Income Tax Withheld",
];

export function build1099IrisCsv(rows: Payee1099[], tinByUser: Map<string, string>): string {
  const lines = [IRIS_1099NEC_HEADERS.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(tinType(r.tinKind)),
        csvField(digits(tinByUser.get(r.userId) ?? "")),
        csvField(r.legalName ?? r.name),
        csvField(r.businessName),
        csvField(r.address1),
        csvField(r.address2),
        csvField(r.city),
        csvField(r.region),
        csvField(r.postalCode),
        usd(r.totalCents),
        "",
        "0.00",
      ].join(","),
    );
  }
  return lines.join("\n");
}

/** Foreign-affiliate records CSV (no TIN decryption, for the owner + CPA). */
export function buildForeignRecordsCsv(rows: Payee1099[]): string {
  const header = [
    "User ID",
    "Legal Name",
    "Business Name",
    "Email",
    "Country",
    "Form Type",
    "Form Status",
    "Valid Through",
    "Expired",
    "Treaty Country",
    "Treaty Rate",
    "TIN Kind",
    "TIN Last 4",
    "Payout Count",
    "Amount Paid USD",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csvField(r.userId),
        csvField(r.legalName ?? r.name),
        csvField(r.businessName),
        csvField(r.email),
        csvField(r.country),
        csvField(r.formType),
        csvField(r.formStatus),
        csvField(r.w8?.validThrough ?? ""),
        csvField(r.w8?.expired ? "yes" : "no"),
        csvField(r.treatyCountry),
        csvField(r.treatyRate != null ? String(r.treatyRate) : ""),
        csvField(r.tinKind),
        csvField(r.tinLast4),
        csvField(r.payoutCount),
        usd(r.totalCents),
      ].join(","),
    );
  }
  return lines.join("\n");
}
